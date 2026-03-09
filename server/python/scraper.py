#!/usr/bin/env python3
import argparse
import json
import re
import time
import unicodedata
import urllib.parse
from typing import Any, Callable, Dict, List, Optional

from selenium import webdriver
from selenium.webdriver.firefox.service import Service as FirefoxService
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys


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


def strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(c for c in normalized if not unicodedata.combining(c))


def slugify(text: str) -> str:
    base = strip_accents(text.lower())
    base = re.sub(r"[^a-z0-9]+", "-", base)
    return base.strip("-") or "belo-horizonte"


def zap_location_segment(filtros: FiltrosType) -> str:
    raw = str(filtros.get("endereco") or filtros.get("cidade") or "Belo Horizonte")
    # prefer explicit endereco like 'Nova Gameleira, Belo Horizonte'
    parts = [p.strip() for p in re.split(r"[,]+", raw) if p.strip()]
    uf = "mg"
    # attempt to recover UF from last token if provided
    raw_tokens = [t for t in re.split(r"[\s,]+", strip_accents(raw.lower())) if t]
    if raw_tokens:
        last = raw_tokens[-1]
        if len(last) == 2 and last.isalpha():
            uf = last
    if len(parts) >= 2:
        bairro = slugify(parts[0])
        city = slugify(parts[1])
        return f"{uf}+{city}+{bairro}"
    # fallback: slugify the whole string and use as city
    cleaned = slugify(raw.replace("+", " "))
    return f"{uf}+{cleaned}"


def map_to_zap_button_label(raw: str, max_value: int = 4) -> Optional[str]:
    tokens = [token.strip() for token in str(raw or "").split(",") if token.strip()]
    best: Optional[int] = None
    for token in tokens:
        num = parse_int(token)
        if num == 0:
            continue
        candidate = min(max_value, num)
        if best is None or candidate < best:
            best = candidate
    if best is None:
        return None
    return f"{best}+"


def row_passes_filters(it: Dict[str, Any], args: argparse.Namespace) -> bool:
    vmin = parse_int(getattr(args, "valorMin", ""))
    vmax = parse_int(getattr(args, "valorMax", ""))
    amin = parse_int(getattr(args, "areaMin", ""))
    amax = parse_int(getattr(args, "areaMax", ""))

    def parse_allowed(raw: str):
        """Return list of (num, at_least_bool) from a comma-separated raw string like '1,2,5+'"""
        out = []
        if not raw:
            return out
        for token in str(raw).split(','):
            t = token.strip()
            if not t:
                continue
            at_least = t.endswith('+')
            num = parse_int(t)
            out.append((num, at_least))
        return out

    allowed_quartos = parse_allowed(getattr(args, "quartos", ""))
    allowed_vagas = parse_allowed(getattr(args, "vagas", ""))
    allowed_banhos = parse_allowed(getattr(args, "banhos", ""))

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

    # bedrooms
    q = parse_int(it.get("quartos", ""))
    if allowed_quartos:
        matched = False
        for num, atleast in allowed_quartos:
            if atleast and q >= num:
                matched = True
                break
            if not atleast and q == num:
                matched = True
                break
        if not matched:
            return False

    # garage
    g = parse_int(it.get("garagem", ""))
    if allowed_vagas:
        matched = False
        for num, atleast in allowed_vagas:
            if atleast and g >= num:
                matched = True
                break
            if not atleast and g == num:
                matched = True
                break
        if not matched:
            return False

    # bathrooms
    b = parse_int(it.get("banhos", "") or it.get("banheiros", ""))
    if allowed_banhos:
        matched = False
        for num, atleast in allowed_banhos:
            if atleast and b >= num:
                matched = True
                break
            if not atleast and b == num:
                matched = True
                break
        if not matched:
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

    def categoria_from_tipo(tipo: str) -> Optional[str]:
        t = (tipo or "").strip().lower()
        if not t or t in {"indiferente", "todos", "all"}:
            return None
        if "casa" in t:
            return "casa"
        if "estacion" in t or "garag" in t:
            return "estacionamento"
        if "sala" in t:
            return "sala"
        if "loja" in t:
            return "loja"
        if "lote" in t or "terreno" in t:
            return "lote"  # netimoveis uses 'lote' para terrenos
        return "apartamento"

    def pick_min_value(raw: str) -> str:
        # raw might be comma-separated like '1,2,5+' or a single token '3+'; pick the smallest numeric value
        if not raw:
            return ""
        parts = [p.strip() for p in str(raw).split(',') if p.strip()]
        nums = []
        for p in parts:
            # remove plus sign and non-digits
            digits = ''.join([c for c in p if c.isdigit()])
            if digits:
                try:
                    nums.append(int(digits))
                except Exception:
                    continue
        if not nums:
            return ""
        return str(min(nums))

    def montar_url():
        categoria = categoria_from_tipo(filtros.get("tipo_imovel", ""))
        raw_city = str(filtros.get("endereco") or filtros.get("cidade") or "Belo Horizonte")
        # If endereco contains 'bairro, city' prefer constructing path with bairro
        parts = [p.strip() for p in re.split(r"[,]+", raw_city) if p.strip()]
        if len(parts) >= 2:
            bairro_slug = slugify(parts[0])
            city_slug = slugify(parts[1])
            base = f"https://www.netimoveis.com/venda/minas-gerais/{city_slug}/{bairro_slug}"
            localizacao_token = f"BR-MG-{city_slug}-{bairro_slug}-"
        else:
            city_slug = slugify(raw_city.replace("+", " "))
            base = f"https://www.netimoveis.com/venda/minas-gerais/{city_slug}"
            localizacao_token = f"BR-MG-{city_slug}---"
        if categoria:
            base = f"{base}/{categoria}"
        # normalize multi-select filters to single minimal values (site expects single numeric thresholds)
        quartos_val = pick_min_value(filtros.get("quartos", ""))
        vagas_val = pick_min_value(filtros.get("vagas", ""))
        banhos_val = pick_min_value(filtros.get("banhos", ""))
        params = {
            "transacao": "venda",
            "localizacao": localizacao_token,
            "quartos": quartos_val,
            "valorMax": filtros.get("valorMax", ""),
            "areaMin": filtros.get("areaMin", ""),
            "vagas": vagas_val,
            "banhos": banhos_val,
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

    # URL exactly: prefer 'bairro_city_mg' when endereco provided like 'bairro, city'
    raw_end = str(filtros.get("endereco") or filtros.get("cidade") or "belo horizonte").lower()
    parts = [p.strip() for p in re.split(r"[,]+", raw_end) if p.strip()]
    if len(parts) >= 2:
        bairro_slug = parts[0].replace(" ", "-")
        city_slug = parts[1].replace(" ", "-")
        endereco_formatado = f"{bairro_slug}_{city_slug}"
    else:
        endereco_formatado = raw_end.replace(" ", "-")
    url = f"https://www.casamineira.com.br/venda/casa/{endereco_formatado}_mg"
    log(f"[Casa Mineira] Acessando: {url}")
    driver.get(url)
    time.sleep(5)

    def aplicar_filtros_via_interface():
        try:
            # QUARTOS (mín)
            q = (filtros.get("quartos") or "").strip()
            if q:
                driver.find_element(By.CSS_SELECTOR, '[data-qa="filters-environmentBedroom"]').click()
                time.sleep(1)
                # tente "2+" e também variações como "2 quartos"
                try:
                    wait.until(EC.element_to_be_clickable((By.XPATH, f'//li//span[contains(normalize-space(), "{q}+")]'))).click()
                except Exception:
                    try:
                        wait.until(EC.element_to_be_clickable((By.XPATH, f'//li//span[contains(translate(.,"QUARTOS","quartos"), "{q} quarto")]'))).click()
                    except Exception:
                        pass
                time.sleep(1)

            # BANHEIROS (mín) - aceita 'banheiros' ou 'banhos'
            b = (filtros.get("banheiros") or filtros.get("banhos") or "").strip()
            if b:
                driver.find_element(By.CSS_SELECTOR, '[data-qa="filters-environmentBathroom"]').click()
                time.sleep(1)
                wait.until(EC.element_to_be_clickable((By.XPATH, f'//li//span[contains(text(), "{b}+")]'))).click()
                time.sleep(1)

            # VAGAS (mín)
            v = (filtros.get("vagas") or "").strip()
            if v:
                driver.find_element(By.CSS_SELECTOR, '[data-qa="filters-garageQuantity"]').click()
                time.sleep(1)
                wait.until(EC.element_to_be_clickable((By.XPATH, f'//li//span[contains(text(), "{v}+")]'))).click()
                time.sleep(1)

            # ÁREA mínima (aceita 'area' ou 'areaMin')
            amin = (filtros.get("area") or filtros.get("areaMin") or "").strip()
            if amin:
                driver.find_element(By.CSS_SELECTOR, '[data-qa="filters-area"]').click()
                time.sleep(1)
                area_input = wait.until(EC.visibility_of_element_located((By.XPATH, '//input[@placeholder="Mínimo"]')))
                area_input.click()
                try:
                    area_input.send_keys(Keys.CONTROL, "a")
                except Exception:
                    area_input.send_keys(Keys.COMMAND, "a")
                area_input.send_keys(Keys.DELETE)
                for c in str(amin):
                    area_input.send_keys(c)
                    time.sleep(0.02)
                area_input.send_keys(Keys.ENTER)
                driver.find_element(By.XPATH, '//button[contains(text(), "Aplicar")]').click()
                time.sleep(2)

            # PREÇO mínimo/máximo (aceita 'preco_min'/'preco_max' e 'valorMin'/'valorMax')
            pmin = (filtros.get("preco_min") or filtros.get("valorMin") or "").strip()
            pmax = (filtros.get("preco_max") or filtros.get("valorMax") or "").strip()
            if pmin or pmax:
                try:
                    driver.find_element(By.CSS_SELECTOR, '[data-qa="filters-priceRangeMore"]').click()
                    time.sleep(1)

                    if pmin:
                        campo_min = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, '[data-qa="inputPreço-min"]')))
                        campo_min.click()
                        try:
                            campo_min.send_keys(Keys.CONTROL, "a")
                        except Exception:
                            campo_min.send_keys(Keys.COMMAND, "a")
                        campo_min.send_keys(Keys.DELETE)
                        for c in str(pmin):
                            campo_min.send_keys(c)
                            time.sleep(0.05)
                        campo_min.send_keys(Keys.ENTER)

                    if pmax:
                        campo_max = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, '[data-qa="inputPreço-max"]')))
                        campo_max.click()
                        try:
                            campo_max.send_keys(Keys.CONTROL, "a")
                        except Exception:
                            campo_max.send_keys(Keys.COMMAND, "a")
                        campo_max.send_keys(Keys.DELETE)
                        for c in str(pmax):
                            campo_max.send_keys(c)
                            time.sleep(0.05)
                        campo_max.send_keys(Keys.ENTER)

                    time.sleep(1)
                    # Oculta elementos que atrapalham clique
                    driver.execute_script("""
                        const iframe = document.querySelector('iframe[src*="accounts.google.com"]');
                        if (iframe) iframe.style.display = 'none';
                        const picker = document.querySelector('#credential_picker_container');
                        if (picker) picker.style.display = 'none';
                        const sugestoes = document.querySelectorAll('.filterPriceRange-module__suggestionItem');
                        sugestoes.forEach(el => el.style.display = 'none');
                    """)

                    botao_aplicar = driver.find_element(By.CSS_SELECTOR, '[data-qa="btn-filters-priceRangeMore-vejaosresultados"]')
                    driver.execute_script("arguments[0].scrollIntoView(true);", botao_aplicar)
                    time.sleep(0.5)
                    botao_aplicar.click()
                    time.sleep(3)
                except Exception as e:
                    log(f"[Casa Mineira] ERRO ao aplicar faixa de preço: {e}")
        except Exception as e:
            log(f"[Casa Mineira] ERRO ao aplicar filtros: {e}")

    aplicar_filtros_via_interface()

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
            # Scroll até o fim, ocultar elementos que atrapalham e avançar
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(2)
            driver.execute_script("""
                const esconder = (selector) => {
                    const el = document.querySelector(selector);
                    if (el) el.style.display = 'none';
                };
                esconder('.components-module__desktop-dropdowns-container');
                esconder('#credential_picker_container');
                esconder('.layoutStyles-module__layoutContainer');
                esconder('.layoutStyles-module__headerLayoutContainer');
                esconder('.thisFiltersSidebar-module__this-filters-sidebar-fixed');
                const sugestoes = document.querySelectorAll('.filterPriceRange-module__suggestionItem');
                sugestoes.forEach(el => el.style.display = 'none');
            """)
            botao_proximo = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, 'a[data-qa="PAGING_NEXT"]'))
            )
            driver.execute_script("arguments[0].scrollIntoView(true);", botao_proximo)
            time.sleep(0.5)
            botao_proximo.click()
            log("[Casa Mineira] Avançando para a próxima página...")
            time.sleep(4)
        except Exception as e:
            log(f"[Casa Mineira] [FIM ou ERRO] Não foi possível avançar: {e}")
            break

    driver.quit(); log("[Casa Mineira] Finalizado.")


def scraping_imovelweb(emit: Callable[[Dict[str, Any]], None], filtros: FiltrosType):
    log("[Imovelweb] Iniciando...")
    driver = build_firefox()
    raw_end = str(filtros.get("endereco") or filtros.get("cidade") or "belo horizonte").lower()
    parts = [p.strip() for p in re.split(r"[,]+", raw_end) if p.strip()]
    if len(parts) >= 2:
        # construct 'bairro-city-mg'
        cidade = f"{parts[0].replace(' ', '-')}-{parts[1].replace(' ', '-')}-mg"
    else:
        cidade = raw_end.replace(' ', '-') + "-mg"
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
    wait = WebDriverWait(driver, 15)

    def categoria_from_tipo(raw: str) -> str:
        t = (raw or "").lower()
        if "casa" in t:
            return "casas"
        if "garag" in t or "estacion" in t:
            return "garagens"
        if "apart" in t:
            return "apartamentos"
        return "imoveis"

    def build_url() -> str:
        categoria = categoria_from_tipo(filtros.get("tipo_imovel", ""))
        raw_end = str(filtros.get("endereco") or filtros.get("cidade") or "Belo Horizonte")
        parts = [p.strip() for p in re.split(r"[,]+", raw_end) if p.strip()]
        city = ''
        bairro = ''
        if len(parts) >= 2:
            bairro = parts[0].replace(' ', '-')
            city = parts[1].replace(' ', '-')
        else:
            city = raw_end.replace(' ', '-')
        # build path similar to example: mg+city++shortbairro (use bairro abbreviated if needed)
        bairro_short = bairro.replace('nova-', 'nv-') if bairro else ''
        location_segment = f"mg+{city}++{bairro_short}" if bairro_short else f"mg+{city}"

        params: Dict[str, Any] = {"transacao": "venda"}
        # build 'onde' param to approximate the site expected structure
        if bairro:
            onde = f",Minas+Gerais,{city.replace('-', '+')},,{bairro.replace('-', '+')},,,neighborhood,BR%3EMinas+Gerais%3ENULL%3E{city.replace('-', '+')}%3EBarrios%3E{bairro.replace('-', '+')},-19.942823,-43.99015,"
            params["onde"] = onde
        # map tipos
        tipo_raw = (filtros.get("tipo_imovel") or "").lower()
        if "apart" in tipo_raw:
            params["tipos"] = "apartamento_residencial"
        elif "casa" in tipo_raw:
            params["tipos"] = "casa_residencial"

        vmax = parse_int(filtros.get("valorMax", ""))
        if vmax:
            params["precoMaximo"] = vmax

        query = urllib.parse.urlencode(params, doseq=True)
        base = f"https://www.zapimoveis.com.br/venda/{categoria}/{location_segment}"
        return f"{base}?{query}" if query else base

    def js_click_all_consent():
        scripts = [
            "(function(){const matches=(t)=>/(aceito|aceitar|concordo|continuar|entendi|ok|prosseguir|fechar|aceitar todos)/.test((t||'').toLowerCase()); let clicked=0; document.querySelectorAll('button,a,div[role=button]').forEach(b=>{try{ if(matches(b.innerText||b.textContent||'')){ b.click(); clicked++; }}catch(e){} }); return clicked;})();"
        ]
        for sc in scripts:
            try:
                driver.execute_script(sc)
            except Exception:
                pass
        # try basic iframe attempts
        try:
            iframes = driver.find_elements(By.CSS_SELECTOR, 'iframe')
            for f in iframes[:6]:
                try:
                    driver.switch_to.frame(f)
                    for sc in scripts:
                        try:
                            driver.execute_script(sc)
                        except Exception:
                            pass
                except Exception:
                    pass
                finally:
                    driver.switch_to.default_content()
        except Exception:
            pass

    def wait_for_list_container() -> str:
        locators = [
            (By.CSS_SELECTOR, 'div.listings-wrapper ul.flex.flex-col.gap-3 li[data-cy="rp-property-cd"]'),
            (By.CSS_SELECTOR, 'ul.flex.flex-col.gap-3 li[data-cy="rp-property-cd"]'),
            (By.CSS_SELECTOR, 'li[data-cy="rp-property-cd"]'),
            (By.CSS_SELECTOR, 'div.listings-wrapper ul li'),
            (By.CSS_SELECTOR, 'a[title][href*="/imovel/"]'),
        ]
        last_exc = None
        for by, sel in locators:
            try:
                wait.until(EC.presence_of_all_elements_located((by, sel)))
                return sel
            except Exception as e:
                last_exc = e
        raise last_exc or Exception("Lista não apareceu")

    def scroll_lazy_load(min_scrolls=3, max_scrolls=7):
        last_h = 0
        for _ in range(max(3, min_scrolls)):
            driver.execute_script("window.scrollBy(0, Math.max(500, window.innerHeight*0.8));")
            time.sleep(0.15)
            h = driver.execute_script("return document.body.scrollHeight")
            if h == last_h:
                break
            last_h = h

    def parse_card(node) -> Dict[str, str]:
        def safe_text(sel):
            try:
                return node.find_element(By.CSS_SELECTOR, sel).text.strip()
            except Exception:
                return ""
        def get_attr(sel, attr):
            try:
                return node.find_element(By.CSS_SELECTOR, sel).get_attribute(attr) or ""
            except Exception:
                return ""
        titulo = safe_text('[data-cy="rp-cardProperty-location-txt"]')
        rua = safe_text('[data-cy="rp-cardProperty-street-txt"]')
        valor = safe_text('[data-cy="rp-cardProperty-price-txt"] > p')
        m2 = safe_text('li[data-cy="rp-cardProperty-propertyArea-txt"] h3')
        quartos = safe_text('li[data-cy="rp-cardProperty-bedroomQuantity-txt"] h3')
        banheiros = safe_text('li[data-cy="rp-cardProperty-bathroomQuantity-txt"] h3')
        vagas = safe_text('li[data-cy="rp-cardProperty-parkingSpacesQuantity-txt"] h3')
        img = get_attr('[data-cy="rp-cardProperty-image-img"] img', 'src') or get_attr('[data-cy="rp-cardProperty-image-img"] img', 'data-src') or get_attr('img', 'src')
        link = get_attr('a', 'href')
        return {
            'titulo': titulo,
            'rua': rua,
            'valor': valor,
            'm2': m2,
            'quartos': quartos,
            'banheiros': banheiros,
            'vagas': vagas,
            'img': sanitize_image(img),
            'link': link,
        }

    def collect_cards_on_page() -> List[Dict[str, str]]:
        sel = wait_for_list_container()
        scroll_lazy_load()
        cards = driver.find_elements(By.CSS_SELECTOR, 'li[data-cy="rp-property-cd"]')
        if not cards:
            cards = driver.find_elements(By.CSS_SELECTOR, 'a[title][href*="/imovel/"]')
        out = []
        for idx, card in enumerate(cards, 1):
            try:
                out.append(parse_card(card))
            except Exception as e:
                try:
                    cards2 = driver.find_elements(By.CSS_SELECTOR, 'li[data-cy="rp-property-cd"]')
                    out.append(parse_card(cards2[idx-1]))
                except Exception:
                    log(f"[ZapImoveis] Falha ao refetch card #{idx}: {e}")
        return out

    def go_next_page() -> bool:
        sels = [
            'nav[data-testid="l-pagination"] button[data-testid="next-page"]:not([disabled])',
            'button[aria-label*="Próxima" i], button[aria-label*="Proxima" i]',
            'a[rel="next"], a[aria-label*="Próxima"]',
        ]
        next_btn = None
        for sel in sels:
            try:
                next_btn = driver.find_element(By.CSS_SELECTOR, sel)
                break
            except Exception:
                continue
        if not next_btn:
            return False
        try:
            first_card = None
            try:
                first_card = driver.find_elements(By.CSS_SELECTOR, 'li[data-cy="rp-property-cd"]')[0]
            except Exception:
                first_card = None
            driver.execute_script("arguments[0].scrollIntoView({block:'center'});", next_btn)
            driver.execute_script("arguments[0].click();", next_btn)
            time.sleep(0.5)
            if first_card:
                WebDriverWait(driver, 10).until(EC.staleness_of(first_card))
            WebDriverWait(driver, 10).until(EC.presence_of_all_elements_located((By.CSS_SELECTOR, 'li[data-cy="rp-property-cd"]')))
            return True
        except Exception:
            return False

    url = build_url()
    log(f"[ZapImoveis] Acessando: {url}")
    try:
        driver.get(url)
        time.sleep(3)
        js_click_all_consent()

        page = 1
        while True:
            log(f"[ZapImoveis] Coletando página {page}...")
            items = collect_cards_on_page()
            log(f"[ZapImoveis] Encontrados {len(items)} cards na página {page}.")
            for it in items:
                try:
                    emit({
                        "site": "ZapImoveis",
                        "nome": it['titulo'] or 'Imóvel',
                        "imagem": it['img'],
                        "valor": it['valor'],
                        "m2": it['m2'],
                        "localizacao": it['rua'],
                        "link": it['link'],
                        "quartos": it['quartos'],
                        "garagem": it['vagas'],
                        "banhos": it['banheiros'],
                    })
                except Exception as e:
                    log(f"[ZapImoveis] Erro ao emitir item: {e}")
            # try next page
            if not go_next_page():
                break
            page += 1
            time.sleep(1)
    except Exception as e:
        log(f"[ZapImoveis] ERRO fatal: {e}")
    finally:
        try:
            driver.quit()
        except Exception:
            pass
        log("[ZapImoveis] Finalizado.")


def scraping_vivareal(emit: Callable[[Dict[str, Any]], None], filtros: FiltrosType):
    log("[VivaReal] Iniciando...")
    driver = build_firefox()
    wait = WebDriverWait(driver, 15)

    def build_base_and_query() -> (str, str):
        raw_end = str(filtros.get("endereco") or filtros.get("cidade") or "belo horizonte").lower().strip()
        parts = [p.strip() for p in re.split(r"[,]+", raw_end) if p.strip()]
        if len(parts) >= 2:
            # use '/bairros/{bairro}' path when we have a bairro
            city = parts[1].replace(' ', '-')
            bairro = parts[0].replace(' ', '-')
            base = f"https://www.vivareal.com.br/venda/minas-gerais/{city}/bairros/{bairro}/"
        else:
            cidade = raw_end.replace(' ', '-')
            base = f"https://www.vivareal.com.br/venda/minas-gerais/{cidade}/"
        params: Dict[str, Any] = {"transacao": "venda"}
        vmin = parse_int(filtros.get("valorMin", ""))
        vmax = parse_int(filtros.get("valorMax", ""))
        amin = parse_int(filtros.get("areaMin", ""))
        amax = parse_int(filtros.get("areaMax", ""))
        # Support CSV lists passed from client (e.g. '2,3,4') — prefer raw CSV when provided
        raw_quartos = filtros.get("quartos", "") or ""
        raw_banhos = filtros.get("banhos", "") or ""
        raw_vagas = filtros.get("vagas", "") or ""

        def set_if_present(key: str, raw_val: str, param_name: str):
            if not raw_val:
                return
            s = str(raw_val)
            if ',' in s:
                params[param_name] = s  # leave CSV as-is (urlencode will escape commas)
            else:
                n = parse_int(s)
                if n:
                    params[param_name] = n

        if vmin:
            params["precoMinimo"] = vmin
        if vmax:
            params["precoMaximo"] = vmax
        if amin:
            params["areaMinima"] = amin
        if amax:
            params["areaMaxima"] = amax

        set_if_present("quartos", raw_quartos, "quartos")
        set_if_present("banhos", raw_banhos, "banheiros")
        set_if_present("vagas", raw_vagas, "vagas")

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
                # bathrooms selector (may vary)
                banheiros = ''
                try:
                    banheiros = card.find_element(By.CSS_SELECTOR, '[data-cy="rp-cardProperty-bathroomQuantity-txt"]').text
                except Exception:
                    try:
                        # fallback: maybe in same detail group
                        banheiros = card.find_element(By.CSS_SELECTOR, '[data-cy="rp-cardProperty-bathroomQuantity"]') .text
                    except Exception:
                        banheiros = ''
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
                    "banhos": banheiros,
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
    wait = WebDriverWait(driver, 12)

    cidade = (filtros.get("cidade") or "belo horizonte").lower().strip().replace(" ", "-")
    url = f"https://www.olx.com.br/imoveis/venda/estado-mg/{cidade}-e-regiao"
    log(f"[OLX] Acessando: {url}")
    driver.get(url)
    # Aceitar cookies (AdOpt banner) antes de aplicar filtros
    try:
        btn = WebDriverWait(driver, 6).until(
            EC.element_to_be_clickable((By.ID, 'adopt-accept-all-button'))
        )
        driver.execute_script("arguments[0].click();", btn)
        time.sleep(0.5)
    except Exception:
        try:
            # Fallback por texto
            btn2 = WebDriverWait(driver, 3).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Aceitar')]"))
            )
            driver.execute_script("arguments[0].click();", btn2)
            time.sleep(0.5)
        except Exception:
            pass

    def aplicar_filtros():
        try:
            wait.until(EC.presence_of_element_located((By.ID, "price_min")))
        except Exception:
            time.sleep(1)
        # Tipo do imóvel (casas/apartamentos)
        try:
            raw_tipo = (filtros.get('tipo_imovel') or '').lower()
            if 'casa' in raw_tipo or 'aparta' in raw_tipo:
                fs = driver.find_element(By.XPATH, "//fieldset[.//legend[contains(., 'Tipo do imóvel')]]")
                def set_cb(label_contains: str, should_check: bool):
                    try:
                        el = fs.find_element(By.XPATH, f".//li[label//p[contains(., '{label_contains}')]]//input[@type='checkbox']")
                        selected = False
                        try:
                            selected = el.is_selected()
                        except Exception:
                            selected = (el.get_attribute('checked') or '').lower() in ('true', 'checked')
                        if should_check and not selected:
                            driver.execute_script('arguments[0].click();', el)
                            time.sleep(0.2)
                        if (not should_check) and selected:
                            driver.execute_script('arguments[0].click();', el)
                            time.sleep(0.2)
                    except Exception:
                        pass
                set_cb('Casas', 'casa' in raw_tipo)
                set_cb('Apartamentos', 'aparta' in raw_tipo)
        except Exception:
            pass
        # Quartos (support multiple values separated by commas)
        try:
            raw_quartos = (filtros.get('quartos') or '')
            if raw_quartos:
                for q in str(raw_quartos).split(','):
                    q = q.strip()
                    if not q:
                        continue
                    try:
                        el = driver.find_element(By.ID, f"chips-id-rooms-{q}")
                        driver.execute_script("arguments[0].click();", el)
                        time.sleep(0.1)
                    except Exception:
                        continue
        except Exception:
            pass
        # Banheiros (support multiple values)
        try:
            raw_banheiros = (filtros.get('banheiros') or filtros.get('banhos') or '')
            if raw_banheiros:
                for b in str(raw_banheiros).split(','):
                    b = b.strip()
                    if not b:
                        continue
                    try:
                        el = driver.find_element(By.ID, f"chips-id-bathrooms-{b}")
                        driver.execute_script("arguments[0].click();", el)
                        time.sleep(0.1)
                    except Exception:
                        continue
        except Exception:
            pass
        # Vagas (support multiple values)
        try:
            raw_vagas = (filtros.get('vagas') or '')
            if raw_vagas:
                for v in str(raw_vagas).split(','):
                    v = v.strip()
                    if not v:
                        continue
                    try:
                        el = driver.find_element(By.ID, f"chips-id-garage_spaces-{v}")
                        driver.execute_script("arguments[0].click();", el)
                        time.sleep(0.1)
                    except Exception:
                        continue
        except Exception:
            pass
        # Preço
        try:
            vmin = (filtros.get('valorMin') or '').strip()
            vmax = (filtros.get('valorMax') or '').strip()
            def set_value(sel_list: list[str], val: str):
                if not val:
                    return False
                for sel in sel_list:
                    try:
                        el = driver.find_element(By.CSS_SELECTOR, sel)
                        el.click()
                        el.send_keys(Keys.CONTROL, 'a')
                        el.send_keys(Keys.DELETE)
                        el.send_keys(val)
                        return True
                    except Exception:
                        continue
                return False
            # Try modern OLX filter panel inputs first (data-cy)
            const_min = set_value(['[data-cy="rp-saleMinPrice-inp"]', '#price-range-min', '#price_min'], vmin)
            const_max = set_value(['[data-cy="rp-saleMaxPrice-inp"]', '#price-range-max', '#price_max'], vmax)
            # Click the specific "aplicar filtro Preço" icon button if present
            try:
                # CSS-based try
                buttons = driver.find_elements(By.CSS_SELECTOR, '.PriceRange_buttonWrapper__bE3B0 button.olx-icon-action, div[class*="PriceRange_buttonWrapper"] button.olx-icon-action')
                for b in buttons:
                    try:
                        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", b)
                        time.sleep(0.2)
                        driver.execute_script("arguments[0].click();", b)
                        break
                    except Exception:
                        continue
                # XPath fallback by hidden label text
                try:
                    b2 = driver.find_element(By.XPATH, "//button[.//span[contains(., 'aplicar filtro Preço')]]")
                    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", b2)
                    time.sleep(0.2)
                    driver.execute_script("arguments[0].click();", b2)
                except Exception:
                    pass
            except Exception:
                pass
        except Exception:
            pass
        # Área
        try:
            amin = (filtros.get('areaMin') or '').strip()
            amax = (filtros.get('areaMax') or '').strip()
            def set_area(sel_list: list[str], val: str):
                if not val:
                    return False
                for sel in sel_list:
                    try:
                        el = driver.find_element(By.CSS_SELECTOR, sel)
                        el.click()
                        el.send_keys(Keys.CONTROL, 'a')
                        el.send_keys(Keys.DELETE)
                        el.send_keys(val)
                        return True
                    except Exception:
                        continue
                return False
            set_area(['[data-cy="rp-minPropertyArea-inp"]', '#minAreaRange', '#size_min'], amin)
            set_area(['[data-cy="rp-maxPropertyArea-inp"]', '#maxAreaRange', '#size_max'], amax)
        except Exception:
            pass
        # Extras opcionais (se existirem no UI/DOM)
        # Aplicar busca se botão existir (evita estado sujo entre páginas)
        try:
            btn_buscar = driver.find_element(By.CSS_SELECTOR, '[data-cy="rp-search-btn"]')
            driver.execute_script("arguments[0].scrollIntoView();", btn_buscar)
            time.sleep(0.3)
            driver.execute_script("arguments[0].click();", btn_buscar)
        except Exception:
            pass

        extras = {
            'piscina': "Piscina",
            'churrasqueira': "Churrasqueira",
            'varanda': "Varanda",
            'mobiliado': "Mobiliado",
            'porteiro24h': "Porteiro 24h",
            'academia': "Academia",
        }
        for nome, label in extras.items():
            try:
                if filtros.get(nome):
                    el = driver.find_element(By.XPATH, f"//p[text()='{label}']/preceding-sibling::input")
                    driver.execute_script("arguments[0].click();", el)
            except Exception:
                pass
        time.sleep(5)

    try:
        aplicar_filtros()
    except Exception as e:
        log(f"[OLX] Erro ao aplicar filtros (continuando): {e}")

    while True:
        cards = driver.find_elements(By.CSS_SELECTOR, 'section.olx-adcard')
        if not cards:
            cards = driver.find_elements(By.CSS_SELECTOR, 'section.olx-ad-card')
        log(f"[OLX] Encontrados {len(cards)} cards na página.")

        for card in cards:
            try:
                titulo = card.find_element(By.CSS_SELECTOR, 'h2').text
                imagem = card.find_element(By.CSS_SELECTOR, 'img').get_attribute('src')
                valor = card.find_element(By.CSS_SELECTOR, 'h3').text
                detalhes = card.find_elements(By.CSS_SELECTOR, '.olx-adcard__detail')
                m2 = quartos = garagem = banheiros = ''
                for d in detalhes:
                    txt = d.get_attribute('aria-label') or d.text or ''
                    txt_low = txt.lower()
                    if 'metro' in txt_low or 'm²' in txt_low or 'm2' in txt_low:
                        m2 = txt
                    elif 'quarto' in txt_low:
                        quartos = txt
                    elif 'vaga' in txt_low or 'vagas' in txt_low:
                        garagem = txt
                    elif 'banh' in txt_low or 'banheiro' in txt_low:
                        banheiros = txt
                localizacao = ''
                try:
                    localizacao = card.find_element(By.CSS_SELECTOR, '.olx-adcard__location').text
                except Exception:
                    pass
                link = ''
                try:
                    link = card.find_element(By.CSS_SELECTOR, 'a').get_attribute('href')
                except Exception:
                    pass
                emit({
                    "site": "OLX",
                    "nome": titulo,
                    "imagem": imagem,
                    "valor": valor,
                    "m2": m2,
                    "localizacao": localizacao,
                    "link": link,
                    "quartos": quartos,
                    "garagem": garagem,
                    "banhos": banheiros,
                })
            except Exception as e:
                log(f"[OLX] Erro ao extrair card: {e}")
                continue

        try:
            botao_proximo = driver.find_element(By.XPATH, '//button[contains(., "Próxima página")]//a')
            next_url = botao_proximo.get_attribute('href')
            if not next_url:
                try:
                    next_url = driver.find_element(By.CSS_SELECTOR, 'a[aria-label*="Próxima" i]').get_attribute('href')
                except Exception:
                    next_url = ''
            if not next_url:
                break
            driver.get(next_url)
            time.sleep(5)
        except Exception:
            break

    driver.quit(); log("[OLX] Finalizado.")


def scraping_quintoandar(emit: Callable[[Dict[str, Any]], None], filtros: FiltrosType):
    log("[QuintoAndar] Iniciando...")
    driver = build_firefox()
    wait = WebDriverWait(driver, 10)

    # Open base search page (we will open filter drawer and apply filters via UI)
    raw_end = str(filtros.get("endereco") or filtros.get("cidade") or "belo horizonte").lower().strip()
    parts = [p.strip() for p in re.split(r"[,]+", raw_end) if p.strip()]
    if len(parts) >= 2:
        city_slug = f"{parts[0].replace(' ', '-')}-{parts[1].replace(' ', '-')}"
    else:
        city_slug = raw_end.replace(' ', '-')
    base_url = f"https://www.quintoandar.com.br/comprar/imovel/{city_slug}-mg-brasil"
    log(f"[QuintoAndar] Acessando base: {base_url}")
    driver.get(base_url)
    time.sleep(4)

    # Helper to safely click an element if present
    def try_click(by, selector, wait_time=3):
        try:
            el = WebDriverWait(driver, wait_time).until(EC.element_to_be_clickable((by, selector)))
            driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", el)
            time.sleep(0.2)
            driver.execute_script("arguments[0].click();", el)
            return True
        except Exception:
            return False

    def open_chip(button_id: str) -> bool:
        try:
            btn = WebDriverWait(driver, 5).until(EC.element_to_be_clickable((By.ID, button_id)))
            driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", btn)
            time.sleep(0.2)
            driver.execute_script("arguments[0].click();", btn)
            time.sleep(0.4)
            return True
        except Exception:
            return False

    def close_chip():
        try:
            driver.find_element(By.TAG_NAME, "body").send_keys(Keys.ESCAPE)
            time.sleep(0.2)
        except Exception:
            try:
                driver.execute_script("document.activeElement && document.activeElement.blur && document.activeElement.blur();")
            except Exception:
                pass

    def clear_and_type(element, value: str, commit: bool = True):
        if element is None:
            return
        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", element)
        time.sleep(0.1)
        element.click()
        try:
            element.send_keys(Keys.CONTROL, "a")
        except Exception:
            element.send_keys(Keys.COMMAND, "a")
        element.send_keys(Keys.DELETE)
        element.send_keys(str(value))
        if commit:
            element.send_keys(Keys.ENTER)
        time.sleep(0.2)

    def select_radio_option(input_id: str) -> bool:
        try:
            label = WebDriverWait(driver, 5).until(EC.element_to_be_clickable((By.XPATH, f"//label[@for='{input_id}']")))
            driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", label)
            time.sleep(0.2)
            driver.execute_script("arguments[0].click();", label)
            time.sleep(0.3)
            return True
        except Exception:
            return False

    # Try to open filters drawer
    try_click(By.ID, 'cockpit-open-button')
    time.sleep(0.6)

    # Apply filters from 'filtros' dict (price, quartos, vagas, banhos, área)
    try:
        vmin = str(filtros.get('valorMin') or '').strip()
        vmax = str(filtros.get('valorMax') or '').strip()
        if vmin or vmax:
            if open_chip('filter-chip-dropdown-chip-itemsalePrice'):
                try:
                    if vmin:
                        el_min = WebDriverWait(driver, 5).until(EC.visibility_of_element_located((By.ID, 'salePrice-input-min')))
                        clear_and_type(el_min, vmin)
                    if vmax:
                        el_max = WebDriverWait(driver, 5).until(EC.visibility_of_element_located((By.ID, 'salePrice-input-max')))
                        clear_and_type(el_max, vmax)
                finally:
                    close_chip()

        amin = str(filtros.get('areaMin') or '').strip()
        amax = str(filtros.get('areaMax') or '').strip()
        if amin or amax:
            if open_chip('filter-chip-dropdown-chip-itemarea'):
                try:
                    if amin:
                        area_min = WebDriverWait(driver, 5).until(EC.visibility_of_element_located((By.ID, 'area-input-min')))
                        clear_and_type(area_min, amin)
                    if amax:
                        area_max = WebDriverWait(driver, 5).until(EC.visibility_of_element_located((By.ID, 'area-input-max')))
                        clear_and_type(area_max, amax)
                finally:
                    close_chip()

        def pick_min_token(raw: str):
            if not raw:
                return None
            parts = [p.strip() for p in str(raw).split(',') if p.strip()]
            nums = []
            for p in parts:
                t = p.replace('+', '')
                digits = ''.join([c for c in t if c.isdigit()])
                if digits:
                    nums.append(int(digits))
            return min(nums) if nums else None

        qraw = filtros.get('quartos') or ''
        qnum = pick_min_token(qraw)
        if qnum is not None:
            qnum = min(qnum, 4)
            if open_chip('filter-chip-dropdown-chip-itembedrooms'):
                try:
                    select_radio_option(f'bedrooms-{qnum}')
                finally:
                    close_chip()

        vraw = filtros.get('vagas') or ''
        vnum = pick_min_token(vraw)
        if vnum is not None:
            vnum = min(vnum, 3)
            if open_chip('filter-chip-dropdown-chip-itemparkingSpaces'):
                try:
                    select_radio_option(f'parkingspaces-{vnum}')
                finally:
                    close_chip()

        braw = filtros.get('banhos') or filtros.get('banheiros') or ''
        bnum = pick_min_token(braw)
        if bnum is not None:
            bnum = min(bnum, 4)
            if open_chip('filter-chip-dropdown-chip-itembathrooms'):
                try:
                    select_radio_option(f'bathrooms-{bnum}')
                finally:
                    close_chip()

        # Final check: close drawer if an explicit apply button exists
        if try_click(By.CSS_SELECTOR, '[data-testid="apply-filters-btn"]', wait_time=2):
            time.sleep(1)
        else:
            close_chip()
    except Exception as e:
        log(f"[QuintoAndar] Erro ao aplicar filtros via UI: {e}")

    # Now paginate/collect cards
    while True:
        cards = driver.find_elements(By.CSS_SELECTOR, '[data-testid="house-card-container"]')
        num_cards_antes = len(cards)
        log(f"[QuintoAndar] Encontrados {num_cards_antes} cards antes do clique.")

        for card in cards:
            try:
                nome = card.find_element(By.CSS_SELECTOR, 'h2').text
                imagem = card.find_element(By.TAG_NAME, 'img').get_attribute('src')
                valor = card.find_element(By.CSS_SELECTOR, 'div.Cozy__CardTitle-Title').text
                detalhes = card.find_element(By.CSS_SELECTOR, 'h3').text
                localizacao = card.find_element(By.CSS_SELECTOR, 'h2.CozyTypography.xih2fc._72Hu5c.Ci-jp3').text
                link = card.find_element(By.TAG_NAME, 'a').get_attribute('href')

                m2 = ""
                quartos = ""
                garagem = ""
                partes = detalhes.split('·')
                if len(partes) > 0:
                    m2 = partes[0].strip()
                if len(partes) > 1:
                    quartos = partes[1].strip()
                # detect parking number if mentioned
                garagem = '—'
                if 'vaga' in detalhes.lower() or 'garagem' in detalhes.lower():
                    # try to extract number
                    import re
                    m = re.search(r"(\d+)\s*(vaga|vagas|garagem)", detalhes.lower())
                    if m:
                        garagem = m.group(1)

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
                continue

        try:
            log("[QuintoAndar] Tentando localizar o botão 'Ver mais'...")
            botao_ver_mais = wait.until(EC.presence_of_element_located((By.ID, 'see-more')))
            driver.execute_script("arguments[0].scrollIntoView();", botao_ver_mais)
            time.sleep(1)
            driver.execute_script("arguments[0].click();", botao_ver_mais)
            log("[QuintoAndar] Clique no botão 'Ver mais' realizado.")
            # aguarda carregar mais cards
            loaded = False
            for _ in range(10):
                time.sleep(1.5)
                novos_cards = driver.find_elements(By.CSS_SELECTOR, '[data-testid="house-card-container"]')
                if len(novos_cards) > num_cards_antes:
                    log(f"[QuintoAndar] Novos cards carregados: {len(novos_cards)}")
                    loaded = True
                    break
            if not loaded:
                log("[QuintoAndar] Nenhum novo card carregado após o clique.")
                break
        except Exception as e:
            log(f"[QuintoAndar] Erro ao clicar no botão 'Ver mais': {e}")
            break

    driver.quit(); log("[QuintoAndar] Finalizado.")


def scraping_loft(emit: Callable[[Dict[str, Any]], None], filtros: FiltrosType):
    log("[Loft] Iniciando...")
    driver = build_firefox()
    raw_end = str(filtros.get("endereco") or filtros.get("cidade") or "belo horizonte").lower().strip()
    parts = [p.strip() for p in re.split(r"[,]+", raw_end) if p.strip()]
    if len(parts) >= 2:
        bairro = parts[0].replace(' ', '-')
        city = parts[1].replace(' ', '-')
        # desired pattern: /mg/{city}/{bairro}_{city}_mg
        url = f"https://loft.com.br/venda/imoveis/mg/{city}/{bairro}_{city}_mg"
    else:
        city_slug = raw_end.replace(' ', '-')
        url = f"https://loft.com.br/venda/imoveis/mg/{city_slug}"
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

    # Monta URL exatamente como no exemplo: tipo + cidade e opcional '?filtro='
    # força sempre modo "a-venda" no caminho
    raw_tipo = (filtros.get("tipo_imovel") or "").strip().lower()
    if not raw_tipo or raw_tipo in {"indiferente", "todos", "all"}:
        tipo = "imoveis-residenciais-a-venda"
    elif raw_tipo in ("apartamentos", "apartamento"):
        tipo = "apartamentos-a-venda"
    elif raw_tipo in ("casas", "casa"):
        tipo = "casas-a-venda"
    else:
        tipo = raw_tipo if "-a-venda" in raw_tipo else f"{raw_tipo}-a-venda"
    cidade = (filtros.get("cidade") or "belo horizonte").strip().lower().replace(" ", "-")

    pmax = str(filtros.get("valorMax") or filtros.get("preco_max") or "").strip().replace("R$", "").replace(".", "")
    raw_ban = str(filtros.get("banhos") or filtros.get("banheiros") or "").strip()
    raw_gar = str(filtros.get("vagas") or filtros.get("garagens") or "").strip()
    raw_quartos = str(filtros.get("quartos") or "").strip()
    amin = str(filtros.get("areaMin") or filtros.get("area") or "").strip()
    amax = str(filtros.get("areaMax") or "").strip()

    def pick_min_token(raw: str):
        if not raw:
            return ''
        parts = [p.strip() for p in str(raw).split(',') if p.strip()]
        nums = []
        for p in parts:
            t = p.replace('+', '')
            digits = ''.join([c for c in t if c.isdigit()])
            if digits:
                try:
                    nums.append(int(digits))
                except Exception:
                    continue
        if not nums:
            return ''
        return str(min(nums))

    ban = pick_min_token(raw_ban)
    gar = pick_min_token(raw_gar)
    quartos_token = pick_min_token(raw_quartos)

    are_codes: list[str] = []
    if filtros.get("piscina"): are_codes.append("10")
    if filtros.get("varanda"): are_codes.append("11")
    if filtros.get("churrasqueira"): are_codes.append("6")
    if filtros.get("salao"): are_codes.append("14")
    if filtros.get("brinquedoteca"): are_codes.append("3")
    # tipos de imóvel extras via códigos tim (pass-through se fornecido)
    tim_codes = filtros.get("tim") if isinstance(filtros.get("tim"), (list, tuple)) else []

    filtro_parts: list[str] = []
    if pmax: filtro_parts.append(f"pmax:{pmax}")
    if ban: filtro_parts.append(f"ban:{ban}")
    if gar: filtro_parts.append(f"gar:{gar}")
    if quartos_token: filtro_parts.append(f"qtd:{quartos_token}")
    if amin: filtro_parts.append(f"amin:{amin}")
    if amax: filtro_parts.append(f"amax:{amax}")
    if are_codes:
        filtro_parts.append(f"are:[{'+'.join(are_codes)}]")
    if tim_codes:
        filtro_parts.append(f"tim:[{'+'.join(map(str, tim_codes))}]")

    filtro_query = ",".join(filtro_parts)
    base_url = f"https://www.chavesnamao.com.br/{tipo}/mg-{cidade}/"
    if quartos_token:
        base_url += f"{quartos_token}-quartos/"
    url = base_url
    if filtro_query:
        url += f"?filtro={filtro_query}"

    log(f"[ChavesNaMao] Acessando: {url}")
    driver.get(url)
    time.sleep(5)

    # Scroll incremental até não aumentar a altura (infinite scroll)
    last_height = driver.execute_script("return document.body.scrollHeight")

    while True:
        cards = driver.find_elements(By.CSS_SELECTOR, 'div[data-template="list"]')
        log(f"[ChavesNaMao] Encontrados {len(cards)} cards na página.")
        for card in cards:
            try:
                titulo = card.find_element(By.CSS_SELECTOR, 'h2').text
                # imagem com fallbacks (lazy, srcset, data-*)
                imagem = ''
                try:
                    img_el = card.find_element(By.CSS_SELECTOR, 'img')
                    src = img_el.get_attribute('src') or ''
                    data_src = img_el.get_attribute('data-src') or img_el.get_attribute('data-original') or ''
                    srcset = img_el.get_attribute('srcset') or ''
                    if src:
                        imagem = src
                    elif data_src:
                        imagem = data_src
                    elif srcset:
                        try:
                            imagem = srcset.split(',')[0].split(' ')[0].strip()
                        except Exception:
                            pass
                except Exception:
                    imagem = ''

                valor_raw = card.find_element(By.CSS_SELECTOR, 'p[aria-label="Preço"] b').text
                valor_num = parse_int(valor_raw)
                if pmax.isdigit() and int(pmax) > 0 and valor_num > int(pmax):
                    log(f"[ChavesNaMao] Valor {valor_num} excede pmax {pmax}; encerrando scraping imediatamente.")
                    try:
                        driver.quit()
                    finally:
                        return

                valor_fmt = f"R$ {valor_num:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

                link = card.find_element(By.CSS_SELECTOR, 'a.link-module__yGkyna__rawLink').get_attribute('href')
                local = card.find_elements(By.CSS_SELECTOR, 'address p')
                localizacao = local[-1].text if local else ''
                detalhes = card.find_elements(By.CSS_SELECTOR, 'span[aria-label="list"] p')
                m2 = quartos = garagem = banhos = ''
                for d in detalhes:
                    txt = d.text.lower()
                    if 'm²' in txt:
                        m2 = d.text
                    elif 'quarto' in txt:
                        quartos = d.text
                    elif 'garagem' in txt:
                        garagem = d.text
                    elif 'banh' in txt or 'banheiro' in txt:
                        banhos = d.text

                emit({
                    "site": "ChavesNaMao",
                    "nome": titulo,
                    "imagem": imagem,
                    "valor": valor_fmt,
                    "m2": m2,
                    "localizacao": localizacao,
                    "link": link,
                    "quartos": quartos,
                    "garagem": garagem,
                    "banhos": banhos,
                })
            except Exception as e:
                log(f"[ChavesNaMao] Erro ao extrair card: {e}")
                continue

        # scroll e verifica crescimento da página
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(3)
        new_height = driver.execute_script("return document.body.scrollHeight")
        if new_height == last_height:
            break
        last_height = new_height

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
    parser.add_argument("--tipo_imovel", type=str, default="")
    parser.add_argument("--endereco", type=str, default="belo horizonte")
    parser.add_argument("--characteristics", type=str, default="")
    parser.add_argument("--amenities", type=str, default="")
    parser.add_argument("--location_options", type=str, default="")
    parser.add_argument("--tour_virtual", action="store_true")
    parser.add_argument("--video", action="store_true")

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
        "characteristics": args.characteristics,
        "amenities": args.amenities,
        "location_options": args.location_options,
        "tour_virtual": args.tour_virtual,
        "video": args.video,
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
