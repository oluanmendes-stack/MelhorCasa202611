#!/usr/bin/env python3
import argparse
import json
import time
import urllib.parse
from typing import Callable, Dict, List, Any

from selenium import webdriver
from selenium.webdriver.firefox.service import Service as FirefoxService
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


def log(msg: str):
    import sys
    sys.stderr.write(msg + "\n")
    sys.stderr.flush()


FiltrosType = dict


# ---------------------------
# Helpers and filtering logic
# ---------------------------

def parse_int(s: str) -> int:
    try:
        return int("".join([c for c in str(s) if c.isdigit()]))
    except Exception:
        return 0


def sanitize_image(url: str) -> str:
    if not url:
        return ""
    if url.startswith("http:"):
        return url.replace("http:", "https:", 1)
    if url.startswith("//"):
        return "https:" + url
    return url


def row_passes_filters(it: Dict[str, Any], args: argparse.Namespace) -> bool:
    vmin = parse_int(getattr(args, "valorMin", ""))
    vmax = parse_int(getattr(args, "valorMax", ""))
    amin = parse_int(getattr(args, "areaMin", ""))
    amax = parse_int(getattr(args, "areaMax", ""))
    qmin = parse_int(getattr(args, "quartos", ""))
    gmin = parse_int(getattr(args, "vagas", ""))

    # sanitize
    it["imagem"] = sanitize_image(it.get("imagem", ""))

    val = parse_int(it.get("valor", ""))
    if vmin and val < vmin:
        return False
    if vmax and val > vmax:
        return False

    area = parse_int(it.get("m2", ""))
    if amin and area < amin:
        return False
    if amax and area > amax:
        return False

    q = parse_int(it.get("quartos", ""))
    if qmin and q and q < qmin:
        return False

    g = parse_int(it.get("garagem", ""))
    if gmin and g and g < gmin:
        return False

    return True


# ---------------------------
# Scrapers (each takes emit)
# ---------------------------

def build_firefox() -> webdriver.Firefox:
    options = Options()
    options.headless = True
    # Lower resource usage
    options.set_preference("dom.ipc.processCount", 1)
    options.set_preference("browser.cache.disk.enable", False)
    options.set_preference("browser.cache.memory.enable", False)
    options.set_preference("network.http.speculative-parallel-limit", 0)
    return webdriver.Firefox(service=FirefoxService(), options=options)


def scraping_netimoveis(emit: Callable[[Dict[str, Any]], None], filtros: FiltrosType):
    log("[Netimóveis] Iniciando...")

    def categoria_from_tipo(tipo: str) -> str:
        t = (tipo or "").lower()
        if "casa" in t:
            return "casa"
        if "estacion" in t or "garag" in t:
            return "estacionamento"
        if "sala" in t:
            return "sala"
        if "loja" in t:
            return "loja"
        return "apartamento"

    def montar_url():
        categoria = categoria_from_tipo(filtros.get("tipo_imovel", ""))
        base = f"https://www.netimoveis.com/venda/minas-gerais/belo-horizonte/{categoria}"
        params = {
            "transacao": "venda",
            "localizacao": "BR-MG-belo-horizonte---",
            "quartos": filtros.get("quartos", ""),
            "valorMax": filtros.get("valorMax", ""),
            "areaMin": filtros.get("areaMin", ""),
            "vagas": filtros.get("vagas", ""),
            "banhos": filtros.get("banhos", ""),
            "pagina": "1",
        }
        return f"{base}?{urllib.parse.urlencode({k: v for k, v in params.items() if v}, doseq=True)}"

    url = montar_url()
    log(f"[Netimóveis] Acessando: {url}")
    driver = build_firefox()
    wait = WebDriverWait(driver, 10)
    driver.get(url)
    time.sleep(2)

    while True:
        cards = driver.find_elements(By.CSS_SELECTOR, "article.card-imovel")
        log(f"[Netimóveis] Encontrados {len(cards)} cards na página.")
        for card in cards:
            try:
                # Prefer real image over placeholder
                img_el = None
                try:
                    img_el = card.find_element(By.CSS_SELECTOR, "img.featured-image")
                except Exception:
                    try:
                        img_el = card.find_element(By.CSS_SELECTOR, "img")
                    except Exception:
                        img_el = None
                imagem = ""
                if img_el is not None:
                    imagem = img_el.get_attribute("src") or ""
                    if (not imagem) or ("sem-foto" in imagem):
                        imagem = img_el.get_attribute("data-defer-src") or imagem
                # fallback: check any image inside swiper wrapper
                if (not imagem) or ("sem-foto" in imagem):
                    try:
                        alt_img = card.find_element(By.CSS_SELECTOR, ".swiper-wrapper img")
                        imagem = alt_img.get_attribute("data-defer-src") or alt_img.get_attribute("src") or imagem
                    except Exception:
                        pass
                imagem = sanitize_image(imagem)

                titulo = card.find_element(By.CSS_SELECTOR, ".tipo h2").text
                m2 = card.find_element(By.CSS_SELECTOR, ".caracteristica.area").text
                quartos = card.find_element(By.CSS_SELECTOR, ".caracteristica.quartos").text
                garagem = card.find_element(By.CSS_SELECTOR, ".caracteristica.vagas").text
                localizacao = card.find_element(By.CSS_SELECTOR, ".endereco").text
                valor = card.find_element(By.CSS_SELECTOR, ".valor").text
                link = card.find_element(By.CSS_SELECTOR, "a.link-imovel").get_attribute("href")
                emit({
                    "site": "Netimoveis",
                    "nome": titulo,
                    "imagem": imagem,
                    "valor": valor,
                    "m2": m2,
                    "localizacao": localizacao,
                    "link": link,
                    "quartos": quartos,
                    "garagem": garagem,
                })
            except Exception as e:
                log(f"[Netimóveis] Erro ao extrair card: {e}")
                continue
        try:
            botao_proximo = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "li.clnext.page-item a.next")))
            driver.execute_script("arguments[0].scrollIntoView();", botao_proximo)
            time.sleep(0.5)
            driver.execute_script("arguments[0].click();", botao_proximo)
            log("[Netimóveis] Avançando para a próxima página...")
            time.sleep(2)
        except Exception as e:
            log(f"[Netimóveis] Fim das páginas ou erro: {e}")
            break

    driver.quit()
    log("[Netimóveis] Finalizado.")


def scraping_casamineira(emit: Callable[[Dict[str, Any]], None], filtros: FiltrosType):
    log("[Casa Mineira] Iniciando...")
    driver = build_firefox()
    wait = WebDriverWait(driver, 15)
    endereco = filtros.get("endereco", filtros.get("cidade", "belo horizonte")).lower().replace(" ", "-")
    tipo = (filtros.get("tipo_imovel") or "").lower()
    categoria = "apartamento" if "aparta" in tipo else ("casa" if "casa" in tipo else "imovel")
    url = f"https://www.casamineira.com.br/venda/{categoria}/{endereco}_mg"
    log(f"[Casa Mineira] Acessando: {url}")
    driver.get(url)
    time.sleep(2)
    try:
        if filtros.get("quartos"):
            driver.find_element(By.CSS_SELECTOR, '[data-qa="filters-environmentBedroom"]').click()
            time.sleep(0.5)
            wait.until(EC.element_to_be_clickable((By.XPATH, f'//li//span[contains(text(), "{filtros["quartos"]}+")]'))).click()
            time.sleep(0.5)
        if filtros.get("banhos"):
            driver.find_element(By.CSS_SELECTOR, '[data-qa="filters-environmentBathroom"]').click()
            time.sleep(0.5)
            wait.until(EC.element_to_be_clickable((By.XPATH, f'//li//span[contains(text(), "{filtros["banhos"]}+")]'))).click()
            time.sleep(0.5)
        if filtros.get("vagas"):
            driver.find_element(By.CSS_SELECTOR, '[data-qa="filters-garageQuantity"]').click()
            time.sleep(0.5)
            wait.until(EC.element_to_be_clickable((By.XPATH, f'//li//span[contains(text(), "{filtros["vagas"]}+")]'))).click()
            time.sleep(0.5)
        if filtros.get("areaMin"):
            driver.find_element(By.CSS_SELECTOR, '[data-qa="filters-area"]').click()
            time.sleep(0.5)
            area_input = wait.until(EC.visibility_of_element_located((By.XPATH, '//input[@placeholder="Mínimo"]')))
            area_input.send_keys(str(filtros["areaMin"]))
            driver.find_element(By.XPATH, '//button[contains(text(), "Aplicar")]').click()
            time.sleep(1)
        if filtros.get("valorMin") or filtros.get("valorMax"):
            driver.find_element(By.CSS_SELECTOR, '[data-qa="filters-priceRangeMore"]').click()
            time.sleep(0.5)
            if filtros.get("valorMin"):
                campo_min = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, '[data-qa="inputPreço-min"]')))
                campo_min.clear(); campo_min.send_keys(str(filtros["valorMin"]))
            if filtros.get("valorMax"):
                campo_max = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, '[data-qa="inputPreço-max"]')))
                campo_max.clear(); campo_max.send_keys(str(filtros["valorMax"]))
            time.sleep(0.5)
            botao_aplicar = driver.find_element(By.CSS_SELECTOR, '[data-qa="btn-filters-priceRangeMore-vejaosresultados"]')
            driver.execute_script("arguments[0].scrollIntoView(true);", botao_aplicar)
            time.sleep(0.25)
            botao_aplicar.click(); time.sleep(1)
    except Exception as e:
        log(f"[Casa Mineira] Erro ao aplicar filtros: {e}")
    while True:
        cards = driver.find_elements(By.CSS_SELECTOR, '.postingCardLayout-module__posting-card-layout')
        log(f"[Casa Mineira] Encontrados {len(cards)} cards na página.")
        for card in cards:
            try:
                titulo = card.find_element(By.CSS_SELECTOR, '.postingCard-module__posting-description a').text
                imagem = card.find_element(By.CSS_SELECTOR, 'img').get_attribute('src')
                valor = card.find_element(By.CSS_SELECTOR, '[data-qa="POSTING_CARD_PRICE"]').text
                detalhes = card.find_elements(By.CSS_SELECTOR, '[data-qa="POSTING_CARD_FEATURES"] span')
                m2 = quartos = garagem = ''
                for d in detalhes:
                    txt = d.text
                    if 'm²' in txt:
                        m2 = txt
                    elif 'quarto' in txt:
                        quartos = txt
                    elif 'vaga' in txt:
                        garagem = txt
                localizacao = card.find_element(By.CSS_SELECTOR, '[data-qa="POSTING_CARD_LOCATION"]').text
                link = card.find_element(By.CSS_SELECTOR, '.postingCard-module__posting-description a').get_attribute('href')
                emit({
                    "site": "CasaMineira",
                    "nome": titulo,
                    "imagem": imagem,
                    "valor": valor,
                    "m2": m2,
                    "localizacao": localizacao,
                    "link": link,
                    "quartos": quartos,
                    "garagem": garagem,
                })
            except Exception as e:
                log(f"[Casa Mineira] Erro ao extrair card: {e}")
                continue
        try:
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);"); time.sleep(1)
            botao_proximo = WebDriverWait(driver, 5).until(EC.element_to_be_clickable((By.CSS_SELECTOR, 'a[data-qa="PAGING_NEXT"]')))
            driver.execute_script("arguments[0].scrollIntoView(true);", botao_proximo); time.sleep(0.25)
            botao_proximo.click(); log("[Casa Mineira] Avançando para a próxima página..."); time.sleep(1.5)
        except Exception as e:
            log(f"[Casa Mineira] Fim das páginas ou erro: {e}")
            break
    driver.quit(); log("[Casa Mineira] Finalizado.")


def scraping_imovelweb(emit: Callable[[Dict[str, Any]], None], filtros: FiltrosType):
    log("[Imovelweb] Iniciando...")
    driver = build_firefox()
    cidade = (filtros.get("cidade") or "belo horizonte").lower().replace(" ", "-") + "-mg"
    tipo = (filtros.get("tipo_imovel") or "").lower()
    categoria = "apartamentos" if "aparta" in tipo else ("casas" if "casa" in tipo else "imoveis")
    url = f"https://www.imovelweb.com.br/{categoria}-venda-{cidade}.html"
    log(f"[Imovelweb] Acessando: {url}")
    driver.get(url); time.sleep(2)
    cards = driver.find_elements(By.CLASS_NAME, 'postingCardLayout-module__posting-card-container')
    log(f"[Imovelweb] Encontrados {len(cards)} cards.")
    for card in cards:
        try:
            link = card.find_element(By.TAG_NAME, 'a').get_attribute('href')
            imagem = card.find_element(By.CSS_SELECTOR, 'img').get_attribute('src')
            titulo = card.find_element(By.CSS_SELECTOR, 'h3.postingCard-module__posting-description').text
            valor = card.find_element(By.CSS_SELECTOR, '[data-qa="POSTING_CARD_PRICE"]').text
            localizacao = card.find_element(By.CSS_SELECTOR, '[data-qa="POSTING_CARD_LOCATION"]').text
            m2 = ''
            caracteristicas = card.find_elements(By.CSS_SELECTOR, '[data-qa="POSTING_CARD_FEATURES"] span')
            for c in caracteristicas:
                if 'm²' in c.text:
                    m2 = c.text
            emit({
                "site": "Imovelweb",
                "nome": titulo,
                "imagem": imagem,
                "valor": valor,
                "m2": m2,
                "localizacao": localizacao,
                "link": link,
                "quartos": '',
                "garagem": '',
            })
        except Exception as e:
            log(f"[Imovelweb] Erro ao extrair card: {e}")
    driver.quit(); log("[Imovelweb] Finalizado.")


def scraping_zapimoveis(emit: Callable[[Dict[str, Any]], None], filtros: FiltrosType):
    log("[ZapImoveis] Iniciando...")
    driver = build_firefox()
    tipo = (filtros.get("tipo_imovel") or "").lower()
    categoria = "apartamentos" if "aparta" in tipo else ("casas" if "casa" in tipo else "imoveis")
    url = f"https://www.zapimoveis.com.br/venda/{categoria}/mg+belo-horizonte"
    log(f"[ZapImoveis] Acessando: {url}")
    driver.get(url); time.sleep(2)
    cards = driver.find_elements(By.CSS_SELECTOR, '[data-testid="property-card"]')
    log(f"[ZapImoveis] Encontrados {len(cards)} cards.")
    for card in cards:
        try:
            titulo = card.find_element(By.CSS_SELECTOR, '[data-testid="card-title"]').text
            imagem = card.find_element(By.CSS_SELECTOR, 'img').get_attribute('src')
            valor = card.find_element(By.CSS_SELECTOR, '[data-testid="price"]').text
            detalhes = card.find_elements(By.CSS_SELECTOR, '[data-testid="feature-item"]')
            m2 = quartos = garagem = ''
            for d in detalhes:
                txt = d.text
                if 'm²' in txt:
                    m2 = txt
                elif 'quarto' in txt:
                    quartos = txt
                elif 'vaga' in txt:
                    garagem = txt
            localizacao = card.find_element(By.CSS_SELECTOR, '[data-testid="address"]').text
            link = card.find_element(By.TAG_NAME, 'a').get_attribute('href')
            emit({
                "site": "ZapImoveis",
                "nome": titulo,
                "imagem": imagem,
                "valor": valor,
                "m2": m2,
                "localizacao": localizacao,
                "link": link,
                "quartos": quartos,
                "garagem": garagem,
            })
        except Exception as e:
            log(f"[ZapImoveis] Erro ao extrair card: {e}")
    driver.quit(); log("[ZapImoveis] Finalizado.")


def scraping_vivareal(emit: Callable[[Dict[str, Any]], None], filtros: FiltrosType):
    log("[VivaReal] Iniciando...")
    driver = build_firefox()
    wait = WebDriverWait(driver, 15)

    def build_base_and_query() -> (str, str):
        cidade = (filtros.get("cidade") or "belo horizonte").lower().strip().replace(" ", "-")
        base = f"https://www.vivareal.com.br/venda/minas-gerais/{cidade}/"
        params: Dict[str, Any] = {"transacao": "venda"}
        vmin = parse_int(filtros.get("valorMin", ""))
        vmax = parse_int(filtros.get("valorMax", ""))
        amin = parse_int(filtros.get("areaMin", ""))
        amax = parse_int(filtros.get("areaMax", ""))
        qmin = parse_int(filtros.get("quartos", ""))
        bmin = parse_int(filtros.get("banhos", ""))
        gmin = parse_int(filtros.get("vagas", ""))
        if vmin: params["precoMinimo"] = vmin
        if vmax: params["precoMaximo"] = vmax
        if amin: params["areaMinima"] = amin
        if amax: params["areaMaxima"] = amax
        if qmin: params["quartos"] = qmin
        if bmin: params["banheiros"] = bmin
        if gmin: params["vagas"] = gmin
        query = urllib.parse.urlencode(params)
        return base, query

    def dismiss_banners():
        # Tenta aceitar cookies/banners para liberar listagem
        try:
            for xpath in [
                "//button[contains(translate(., 'ACEITAR', 'aceitar'), 'aceitar')]",
                "//button[contains(., 'Entendi')]",
                "//button[contains(., 'Aceitar todos')]",
                "//button[contains(., 'Continuar')]",
            ]:
                try:
                    btn = wait.until(EC.element_to_be_clickable((By.XPATH, xpath)))
                    btn.click(); time.sleep(0.5)
                    break
                except Exception:
                    continue
        except Exception:
            pass

    def scroll_load_all(max_scrolls: int = 20):
        # Rola até não haver aumento de cards
        last_count = -1
        same_count_rounds = 0
        for i in range(max_scrolls):
            cards = driver.find_elements(By.CSS_SELECTOR, 'li[data-cy="rp-property-cd"]')
            count = len(cards)
            if count == last_count:
                same_count_rounds += 1
            else:
                same_count_rounds = 0
            last_count = count
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(0.8)
            if same_count_rounds >= 2:
                break

    base, query = build_base_and_query()
    seen: set[str] = set()
    total_emitted = 0

    for page in range(1, 51):  # limite de 50 páginas por segurança
        url = base
        if query:
            url = f"{url}?{query}&pagina={page}"
        else:
            url = f"{url}?pagina={page}"
        log(f"[VivaReal] Acessando página {page}: {url}")
        driver.get(url)
        time.sleep(2.5)
        if page == 1:
            dismiss_banners()
            time.sleep(0.5)
        # Em muitas vezes o VR carrega mais cards ao rolar
        scroll_load_all(max_scrolls=25)

        cards = driver.find_elements(By.CSS_SELECTOR, 'li[data-cy="rp-property-cd"]')
        log(f"[VivaReal] Página {page}: {len(cards)} cards carregados.")
        if len(cards) == 0:
            log("[VivaReal] Nenhum card encontrado; encerrando paginação.")
            break

        new_on_page = 0
        for card in cards:
            try:
                link = card.find_element(By.TAG_NAME, 'a').get_attribute('href')
                if not link or link in seen:
                    continue
                seen.add(link)
                new_on_page += 1
                img_el = None
                try:
                    img_el = card.find_element(By.CSS_SELECTOR, 'img')
                except Exception:
                    img_el = None
                imagem = sanitize_image(img_el.get_attribute('src') if img_el is not None else '')
                titulo = card.find_element(By.CSS_SELECTOR, '[data-cy="rp-cardProperty-location-txt"]').text
                rua = card.find_element(By.CSS_SELECTOR, '[data-cy="rp-cardProperty-street-txt"]').text
                m2 = card.find_element(By.CSS_SELECTOR, '[data-cy="rp-cardProperty-propertyArea-txt"]').text
                quartos = card.find_element(By.CSS_SELECTOR, '[data-cy="rp-cardProperty-bedroomQuantity-txt"]').text
                garagem = card.find_element(By.CSS_SELECTOR, '[data-cy="rp-cardProperty-parkingSpacesQuantity-txt"]').text
                valor = card.find_element(By.CSS_SELECTOR, '[data-cy="rp-cardProperty-price-txt"] p').text
                localizacao = f"{titulo}, {rua}"
                emit({
                    "site": "VivaReal",
                    "nome": titulo,
                    "imagem": imagem,
                    "valor": valor,
                    "m2": m2,
                    "localizacao": localizacao,
                    "link": link,
                    "quartos": quartos,
                    "garagem": garagem,
                })
                total_emitted += 1
            except Exception as e:
                log(f"[VivaReal] Erro ao extrair card: {e}")
                continue

        log(f"[VivaReal] Página {page}: emitidos {new_on_page} novos (total {total_emitted}).")
        if new_on_page == 0:
            log("[VivaReal] Nenhum novo card nesta página; encerrando.")
            break

    driver.quit(); log("[VivaReal] Finalizado.")


def scraping_olx(emit: Callable[[Dict[str, Any]], None], filtros: FiltrosType):
    log("[OLX] Iniciando...")
    driver = build_firefox()
    cidade = (filtros.get("cidade") or "belo horizonte").lower().strip().replace(" ", "-")
    # Use a broader category path so it works for casas/apartamentos; OLX will list both
    url = f"https://www.olx.com.br/imoveis/venda/estado-mg/{cidade}-e-regiao"
    log(f"[OLX] Acessando: {url}")
    driver.get(url)
    try:
        WebDriverWait(driver, 12).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, 'section.olx-adcard, section.olx-ad-card, [data-ds-component="ad-card"], a[href*="/d/"]')) > 0)
    except Exception:
        time.sleep(2)
    time.sleep(1)

    # try multiple patterns to capture cards across OLX variants
    selectors = [
        'section.olx-ad-card',
        'section.olx-adcard',
        '[data-ds-component="ad-card"]',
        'li a[href*="/d/"]',
    ]
    cards: List[Any] = []
    for sel in selectors:
        found = driver.find_elements(By.CSS_SELECTOR, sel)
        if found:
            cards = found
            break
    if not cards:
        # fallback to all links; we'll filter later
        cards = driver.find_elements(By.CSS_SELECTOR, 'a[href*="olx.com.br/"]')

    log(f"[OLX] Encontrados {len(cards)} cards.")
    for card in cards:
        try:
            # scope for searches
            ctx = card
            # if current element is an <a>, keep a ref
            link = None
            try:
                link = ctx.get_attribute('href') if ctx.tag_name.lower() == 'a' else None
            except Exception:
                link = None
            if not link:
                try:
                    link = ctx.find_element(By.CSS_SELECTOR, 'a').get_attribute('href')
                except Exception:
                    link = ''

            # extract fields with fallbacks
            def first_text(selectors_list: List[str]) -> str:
                for s in selectors_list:
                    try:
                        el = ctx.find_element(By.CSS_SELECTOR, s)
                        t = el.text.strip()
                        if t:
                            return t
                    except Exception:
                        try:
                            # some cards keep data in aria-label
                            el = ctx.find_element(By.CSS_SELECTOR, s)
                            t = el.get_attribute('aria-label') or ''
                            t = t.strip()
                            if t:
                                return t
                        except Exception:
                            pass
                return ''

            def first_attr(selectors_list: List[str], attr: str) -> str:
                for s in selectors_list:
                    try:
                        el = ctx.find_element(By.CSS_SELECTOR, s)
                        v = el.get_attribute(attr) or ''
                        if v:
                            return v
                    except Exception:
                        continue
                return ''

            titulo = first_text(['h2', '[data-testid*="ad-title"]', '[class*="ad-card__title"]'])
            valor = first_text(['h3', '[data-testid*="ad-price"]', '[class*="ad-card__price"]', '[aria-label*="preço" i]'])
            localizacao = first_text(['.olx-adcard__location', '[class*="location"]', '[aria-label*="localiza" i]'])
            imagem = first_attr(['img', 'img[loading]'], 'src')
            detalhes_nodes = ctx.find_elements(By.CSS_SELECTOR, '.olx-adcard__detail, [aria-label*="quarto" i], [aria-label*="vaga" i], [aria-label*="metro" i]')
            m2 = quartos = garagem = ''
            for d in detalhes_nodes:
                txt = (d.get_attribute('aria-label') or d.text or '').lower()
                if 'm²' in txt or 'metro' in txt or 'm2' in txt:
                    m2 = d.text or d.get_attribute('aria-label') or ''
                elif 'quarto' in txt:
                    quartos = d.text or d.get_attribute('aria-label') or ''
                elif 'vaga' in txt:
                    garagem = d.text or d.get_attribute('aria-label') or ''

            emit({
                "site": "OLX",
                "nome": titulo or "",
                "imagem": imagem or "",
                "valor": valor or "",
                "m2": m2 or "",
                "localizacao": localizacao or "",
                "link": link or "",
                "quartos": quartos or "",
                "garagem": garagem or "",
            })
        except Exception as e:
            log(f"[OLX] Erro ao extrair card: {e}")
            continue

    driver.quit(); log("[OLX] Finalizado.")


def scraping_quintoandar(emit: Callable[[Dict[str, Any]], None], filtros: FiltrosType):
    log("[QuintoAndar] Iniciando...")
    driver = build_firefox()
    url = "https://www.quintoandar.com.br/comprar/imovel/belo-horizonte-mg-brasil/de-150000-a-250000-venda"
    log(f"[QuintoAndar] Acessando: {url}")
    driver.get(url); time.sleep(2)
    cards = driver.find_elements(By.CSS_SELECTOR, '[data-testid="house-card-container"]')
    log(f"[QuintoAndar] Encontrados {len(cards)} cards.")
    for card in cards:
        try:
            nome = card.find_element(By.CSS_SELECTOR, 'h2').text
            imagem = card.find_element(By.TAG_NAME, 'img').get_attribute('src')
            valor = card.find_element(By.CSS_SELECTOR, 'div.Cozy__CardTitle-Title').text
            detalhes = card.find_element(By.CSS_SELECTOR, 'h3').text
            localizacao = card.find_element(By.CSS_SELECTOR, 'h2.CozyTypography.xih2fc._72Hu5c.Ci-jp3').text
            link = card.find_element(By.TAG_NAME, 'a').get_attribute('href')
            m2 = quartos = garagem = ""
            partes = detalhes.split('·')
            if len(partes) > 0:
                m2 = partes[0].strip()
            if len(partes) > 1:
                quartos = partes[1].strip()
            if "garagem" in detalhes:
                garagem = "1"
            else:
                garagem = "0"
            emit({
                "site": "QuintoAndar",
                "nome": nome,
                "imagem": imagem,
                "valor": valor,
                "m2": m2,
                "localizacao": localizacao,
                "link": link,
                "quartos": quartos,
                "garagem": garagem,
            })
        except Exception as e:
            log(f"[QuintoAndar] Erro ao extrair card: {e}")
    driver.quit(); log("[QuintoAndar] Finalizado.")


def scraping_loft(emit: Callable[[Dict[str, Any]], None], filtros: FiltrosType):
    log("[Loft] Iniciando...")
    driver = build_firefox()
    url = "https://loft.com.br/venda/imoveis/mg/belo-horizonte"
    log(f"[Loft] Acessando: {url}")
    driver.get(url); time.sleep(2)
    cards = driver.find_elements(By.CSS_SELECTOR, 'a.MuiCardActionArea-root')
    log(f"[Loft] Encontrados {len(cards)} cards.")
    for card in cards:
        try:
            link = card.get_attribute('href')
            imagem = card.find_element(By.CSS_SELECTOR, 'img').get_attribute('src')
            titulo = card.find_element(By.CSS_SELECTOR, 'h2').text
            valor = card.find_element(By.CSS_SELECTOR, 'span[class*=MuiTypography-root]').text
            localizacao = card.find_element(By.CSS_SELECTOR, 'h2.MuiTypography-root').text
            m2 = ''
            detalhes = card.find_elements(By.CSS_SELECTOR, 'div[class*=MuiBox-root] span')
            for d in detalhes:
                if 'm²' in d.text:
                    m2 = d.text
            emit({
                "site": "Loft",
                "nome": titulo,
                "imagem": imagem,
                "valor": valor,
                "m2": m2,
                "localizacao": localizacao,
                "link": link,
                "quartos": '',
                "garagem": '',
            })
        except Exception as e:
            log(f"[Loft] Erro ao extrair card: {e}")
    driver.quit(); log("[Loft] Finalizado.")


def scraping_chavesnamao(emit: Callable[[Dict[str, Any]], None], filtros: FiltrosType):
    log("[ChavesNaMao] Iniciando...")
    driver = build_firefox()
    tipo = filtros.get("tipo_imovel", "apartamentos-a-venda")
    cidade = (filtros.get("cidade") or "belo horizonte").lower().replace(" ", "-")
    url = f"https://www.chavesnamao.com.br/{tipo}/mg-{cidade}/"
    log(f"[ChavesNaMao] Acessando: {url}")
    driver.get(url); time.sleep(2)
    cards = driver.find_elements(By.CSS_SELECTOR, 'div[data-template="list"]')
    log(f"[ChavesNaMao] Encontrados {len(cards)} cards.")
    for card in cards:
        try:
            titulo = card.find_element(By.CSS_SELECTOR, 'h2').text
            imagem = card.find_element(By.CSS_SELECTOR, 'img').get_attribute('src')
            valor = card.find_element(By.CSS_SELECTOR, 'p[aria-label="Preço"] b').text
            link = card.find_element(By.CSS_SELECTOR, 'a.link-module__yGkyna__rawLink').get_attribute('href')
            local = card.find_elements(By.CSS_SELECTOR, 'address p')
            localizacao = local[-1].text if local else ''
            detalhes = card.find_elements(By.CSS_SELECTOR, 'span[aria-label="list"] p')
            m2 = quartos = garagem = ''
            for d in detalhes:
                txt = d.text.lower()
                if 'm²' in txt:
                    m2 = txt
                elif 'quarto' in txt:
                    quartos = txt
                elif 'garagem' in txt:
                    garagem = txt
            emit({
                "site": "ChavesNaMao",
                "nome": titulo,
                "imagem": imagem,
                "valor": valor,
                "m2": m2,
                "localizacao": localizacao,
                "link": link,
                "quartos": quartos,
                "garagem": garagem,
            })
        except Exception as e:
            log(f"[ChavesNaMao] Erro ao extrair card: {e}")
    driver.quit(); log("[ChavesNaMao] Finalizado.")


# ---------------------------
# Main (supports JSON array or NDJSON streaming)
# ---------------------------

def main():
    parser = argparse.ArgumentParser(description="Headless real-estate scraper CLI")
    # Site flags
    parser.add_argument("--netimoveis", action="store_true")
    parser.add_argument("--casamineira", action="store_true")
    parser.add_argument("--imovelweb", action="store_true")
    parser.add_argument("--zapimoveis", action="store_true")
    parser.add_argument("--vivareal", action="store_true")
    parser.add_argument("--olx", action="store_true")
    parser.add_argument("--quintoandar", action="store_true")
    parser.add_argument("--loft", action="store_true")
    parser.add_argument("--chavesnamao", action="store_true")

    # Filters
    parser.add_argument("--quartos", type=str, default="")
    parser.add_argument("--valorMax", type=str, default="")
    parser.add_argument("--valorMin", type=str, default="")
    parser.add_argument("--areaMin", type=str, default="")
    parser.add_argument("--areaMax", type=str, default="")
    parser.add_argument("--vagas", type=str, default="")
    parser.add_argument("--banhos", type=str, default="")
    parser.add_argument("--cidade", type=str, default="belo horizonte")
    parser.add_argument("--tipo_imovel", type=str, default="apartamentos-a-venda")
    parser.add_argument("--endereco", type=str, default="belo horizonte")

    parser.add_argument("--output", type=str, choices=["json"], default="json")
    parser.add_argument("--stream", action="store_true")

    args = parser.parse_args()

    # streaming emitter prints NDJSON lines, otherwise we collect in a list
    rows: List[Dict[str, Any]] = []

    def collector_emit(obj: Dict[str, Any]):
        rows.append(obj)

    def streaming_emit(obj: Dict[str, Any]):
        try:
            if row_passes_filters(obj, args):
                print(json.dumps(obj, ensure_ascii=False))
        except Exception as e:
            log(f"[stream] erro ao emitir: {e}")

    emit: Callable[[Dict[str, Any]], None] = streaming_emit if args.stream else collector_emit

    filtros: FiltrosType = {
        "quartos": args.quartos,
        "valorMax": args.valorMax,
        "valorMin": args.valorMin,
        "areaMin": args.areaMin,
        "areaMax": args.areaMax,
        "vagas": args.vagas,
        "banhos": args.banhos,
        "tipo": [],
        "maisOpcoes": [],
        "cidade": args.cidade,
        "tipo_imovel": args.tipo_imovel,
        "endereco": args.endereco,
    }

    if args.netimoveis:
        scraping_netimoveis(emit, filtros)
    if args.casamineira:
        scraping_casamineira(emit, filtros)
    if args.imovelweb:
        scraping_imovelweb(emit, filtros)
    if args.zapimoveis:
        scraping_zapimoveis(emit, filtros)
    if args.vivareal:
        scraping_vivareal(emit, filtros)
    if args.olx:
        scraping_olx(emit, filtros)
    if args.quintoandar:
        scraping_quintoandar(emit, filtros)
    if args.loft:
        scraping_loft(emit, filtros)
    if args.chavesnamao:
        scraping_chavesnamao(emit, filtros)

    if not args.stream:
        # apply filters at the end in non-streaming mode
        filtered: List[Dict[str, Any]] = []
        for it in rows:
            if row_passes_filters(it, args):
                filtered.append(it)
        print(json.dumps(filtered, ensure_ascii=False))


if __name__ == "__main__":
    main()
