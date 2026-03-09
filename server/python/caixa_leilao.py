#!/usr/bin/env python3
import argparse
import json
import time
import re
from typing import List, Dict, Any
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.service import Service as FirefoxService
from selenium.webdriver.firefox.options import Options as FirefoxOptions
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.firefox import GeckoDriverManager


def remover_tela_carregamento(driver):
    try:
        driver.execute_script("""
            var overlay = document.querySelector('.ui-widget-overlay.ui-front');
            if (overlay) overlay.remove();
            var dialog = document.querySelector('.ui-dialog.ui-widget.ui-widget-content.ui-corner-all.ui-front.no_titlebar.no_background.ui-draggable');
            if (dialog) dialog.remove();
        """)
    except Exception:
        pass


def sanitize_image(url: str) -> str:
    if not url:
        return ""
    if url.startswith("http:"):
        return url.replace("http:", "https:", 1)
    if url.startswith("//"):
        return "https:" + url
    return url


def parse_modalidades(s: str) -> List[str]:
    if not s:
        return []
    return [x.strip() for x in s.split(',') if x.strip()]


def parse_cidades(s: str) -> List[str]:
    if not s:
        return []
    return [x.strip() for x in s.split(',') if x.strip()]


def build_driver(headless=True):
    options = FirefoxOptions()
    if headless:
        options.headless = True
    # set window size
    options.add_argument('--width=1280')
    options.add_argument('--height=800')
    # instantiate Firefox webdriver using geckodriver
    driver = webdriver.Firefox(service=FirefoxService(GeckoDriverManager().install()), options=options)
    return driver


def extract_from_caixa(modalidades: List[str], cidades: List[str], faixa_valor: str, tipo_imovel: str, quartos: str, vagas: str, area_util: str, verificar_financiamento: bool) -> List[Dict[str, Any]]:
    url = "https://venda-imoveis.caixa.gov.br/sistema/busca-imovel.asp?sltTipoBusca=imoveis"
    driver = build_driver(headless=True)
    wait = WebDriverWait(driver, 15)
    results: List[Dict[str, Any]] = []

    try:
        # if no cidades provided, iterate with empty string for "Todas as cidades"
        cidades_iter = cidades or [""]
        modalidades_iter = modalidades or [""]

        for cidade_id in cidades_iter:
            for modalidade_id in modalidades_iter:
                driver.get(url)
                try:
                    Select(wait.until(EC.presence_of_element_located((By.ID, "cmb_estado")))).select_by_value("MG")
                except Exception:
                    pass
                time.sleep(1)

                if cidade_id:
                    try:
                        Select(wait.until(EC.presence_of_element_located((By.ID, "cmb_cidade")))).select_by_value(cidade_id)
                    except Exception:
                        pass
                    time.sleep(0.8)

                if modalidade_id:
                    try:
                        Select(wait.until(EC.presence_of_element_located((By.ID, "cmb_modalidade")))).select_by_value(modalidade_id)
                    except Exception:
                        pass
                    time.sleep(0.8)

                try:
                    wait.until(EC.element_to_be_clickable((By.ID, "btn_next0"))).click()
                except Exception:
                    pass
                time.sleep(1)

                # apply other filters
                try:
                    Select(wait.until(EC.presence_of_element_located((By.ID, "cmb_tp_imovel")))).select_by_value(tipo_imovel)
                except Exception:
                    pass
                try:
                    Select(wait.until(EC.presence_of_element_located((By.ID, "cmb_quartos")))).select_by_value(quartos)
                except Exception:
                    pass
                try:
                    Select(wait.until(EC.presence_of_element_located((By.ID, "cmb_vg_garagem")))).select_by_value(vagas)
                except Exception:
                    pass
                try:
                    Select(wait.until(EC.presence_of_element_located((By.ID, "cmb_area_util")))).select_by_value(area_util)
                except Exception:
                    pass
                try:
                    Select(wait.until(EC.presence_of_element_located((By.ID, "cmb_faixa_vlr")))).select_by_value(faixa_valor)
                except Exception:
                    pass

                try:
                    next_btn = wait.until(EC.element_to_be_clickable((By.ID, "btn_next1")))
                    next_btn.click()
                except Exception:
                    pass
                time.sleep(1.5)

                pagina_atual = 1
                while True:
                    time.sleep(1)
                    imoveis = driver.find_elements(By.CSS_SELECTOR, 'ul.control-group.no-bullets')
                    if not imoveis:
                        break

                    for idx in range(len(imoveis)):
                        try:
                            # re-query elements each iteration to avoid stale element references
                            imoveis = driver.find_elements(By.CSS_SELECTOR, 'ul.control-group.no-bullets')
                            if idx >= len(imoveis):
                                break
                            imovel = imoveis[idx]

                            # scroll into view to ensure images/lazy elements load
                            try:
                                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", imovel)
                                time.sleep(0.2)
                            except Exception:
                                pass

                            texto_imovel = ""
                            try:
                                a_tag = imovel.find_element(By.CSS_SELECTOR, 'a[onclick^="javascript:detalhe_imovel"]')
                                texto_imovel = a_tag.find_element(By.TAG_NAME, "strong").text.strip()
                            except Exception:
                                texto_imovel = imovel.find_element(By.TAG_NAME, "strong").text.strip()

                            descritivo = texto_imovel.split('|')[0].strip() if texto_imovel else ""
                            valor = ""
                            # try parse quartos/vagas from the listing text (may be present)
                            quartos_encontrados = ""
                            vagas_encontradas = ""
                            try:
                                mq = re.search(r'(\d+)\s*Quartos?', texto_imovel, re.IGNORECASE)
                                if mq:
                                    quartos_encontrados = mq.group(1)
                                mv = re.search(r'(\d+)\s*Vaga', texto_imovel, re.IGNORECASE)
                                if mv:
                                    vagas_encontradas = mv.group(1)
                            except Exception:
                                pass
                            if '| R$' in texto_imovel:
                                valor = texto_imovel.split('| R$')[-1].strip()
                            elif 'R$' in texto_imovel:
                                # fallback
                                m = re.search(r'R\$\s*([\d\.,]+)', texto_imovel)
                                if m:
                                    valor = m.group(1)

                            aceita_financiamento = "Não informado"
                            aceita_parcelamento = "Não informado"

                            foto_url = ""
                            matricula_url = ""
                            edital_url = ""

                            # try to extract image from the listing itself (works when preview available in list)
                            try:
                                img_elem_list = imovel.find_elements(By.TAG_NAME, 'img')
                                if img_elem_list:
                                    src = img_elem_list[0].get_attribute('src')
                                    if src:
                                        foto_url = ("https://venda-imoveis.caixa.gov.br" + src) if src.startswith("/") else src
                            except Exception:
                                pass
                            quartos_encontrados = ""
                            vagas_encontradas = ""
                            endereco_text = ""

                            # always open detalhe para capturar matrícula/edital; checagens de financiamento ficam condicionais
                            if True:
                                try:
                                    link_detalhe = imovel.find_element(By.CSS_SELECTOR, 'a[onclick^="javascript:detalhe_imovel"]')
                                    driver.execute_script("arguments[0].scrollIntoView();", link_detalhe)
                                    time.sleep(0.2)
                                    link_detalhe.click()
                                    wait.until(EC.presence_of_element_located((By.TAG_NAME, "body")))
                                    time.sleep(1)

                                    try:
                                        img_elem = WebDriverWait(driver, 2).until(EC.presence_of_element_located((By.ID, "preview")))
                                        src = img_elem.get_attribute("src")
                                        if src:
                                            foto_url = ("https://venda-imoveis.caixa.gov.br" + src) if src.startswith("/") else src
                                    except Exception:
                                        foto_url = ""

                                    try:
                                        matricula_elem = driver.find_element(By.XPATH, "//a[contains(@onclick,'matricula')]")
                                        href = matricula_elem.get_attribute("onclick")
                                        if href and "ExibeDoc" in href:
                                            path = href.split("ExibeDoc(")[1].split(")")[0].replace("'", "").strip()
                                            matricula_url = f"https://venda-imoveis.caixa.gov.br{path}"
                                    except Exception:
                                        matricula_url = ""

                                    try:
                                        edital_elem = driver.find_element(By.XPATH, "//a[contains(@onclick,'.PDF') and contains(.,'edital')]")
                                        href = edital_elem.get_attribute("onclick")
                                        if href and "ExibeDoc" in href:
                                            path = href.split("ExibeDoc(")[1].split(")")[0].replace("'", "").strip()
                                            edital_url = f"https://venda-imoveis.caixa.gov.br{path}"
                                    except Exception:
                                        edital_url = ""

                                    # parse description and address from details page
                                    desc_text = ""
                                    endereco_text = ""
                                    try:
                                        # try find paragraph with strong 'Descrição' label
                                        desc_elem = driver.find_element(By.XPATH, "//p[strong[contains(translate(., 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), 'DESCRIÇÃO')]]")
                                        # desc_elem.text may contain 'Descrição:' and the following lines
                                        desc_text = desc_elem.text.replace('Descrição:', '').replace('DESCRIÇÃO:', '').strip()
                                    except Exception:
                                        # fallback: search in page source
                                        try:
                                            ps = driver.page_source
                                            m = re.search(r'<strong>\s*Descrição:\s*</strong>\s*<br\s*/?>\s*([^<]+)', ps, re.IGNORECASE)
                                            if m:
                                                desc_text = m.group(1).strip()
                                        except Exception:
                                            desc_text = ""

                                    try:
                                        end_elem = driver.find_element(By.XPATH, "//p[strong[contains(translate(., 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), 'ENDEREÇO')]]")
                                        endereco_text = end_elem.text.replace('Endereço:', '').replace('ENDEREÇO:', '').strip()
                                    except Exception:
                                        try:
                                            ps = driver.page_source
                                            m2 = re.search(r'<strong>\s*Endere[cç]o:\s*</strong>\s*<br\s*/?>\s*([^<]+)', ps, re.IGNORECASE)
                                            if m2:
                                                endereco_text = m2.group(1).strip()
                                        except Exception:
                                            endereco_text = ""

                                    # parse quartos and vagas from desc_text
                                    quartos_encontrados = ""
                                    vagas_encontradas = ""
                                    try:
                                        mq = re.search(r'(\d+)\s*Quartos?', desc_text, re.IGNORECASE)
                                        if mq:
                                            quartos_encontrados = mq.group(1)
                                        mv = re.search(r'(\d+)\s*Vaga', desc_text, re.IGNORECASE)
                                        if mv:
                                            vagas_encontradas = mv.group(1)
                                    except Exception:
                                        pass

                                    if verificar_financiamento:
                                        page_source = driver.page_source
                                        if "Imóvel NÃO aceita financiamento habitacional" in page_source:
                                            aceita_financiamento = "Não aceita"
                                        elif "Permite financiamento" in page_source or "Permite financiar" in page_source:
                                            aceita_financiamento = "Aceita"
                                        else:
                                            aceita_financiamento = "Não informado"

                                        if "Imóvel NÃO aceita parcelamento" in page_source:
                                            aceita_parcelamento = "Não aceita"
                                        elif "Imóvel aceita parcelamento" in page_source:
                                            aceita_parcelamento = "Aceita"
                                        else:
                                            aceita_parcelamento = "Não informado"

                                except Exception:
                                    # ignore detail failures
                                    pass
                                finally:
                                    # try click a specific 'voltar'/'retornar' control first, fallback to driver.back()
                                    try:
                                        clicked = False
                                        candidates = [
                                            "//a[contains(., 'Retornar')]",
                                            "//a[contains(., 'Voltar')]",
                                            "//button[contains(., 'Retornar')]",
                                            "//button[contains(., 'Voltar')]",
                                            "//a[contains(@onclick,'Retornar')]",
                                            "//a[contains(@onclick,'Voltar')]",
                                        ]
                                        for xp in candidates:
                                            try:
                                                el = WebDriverWait(driver, 2).until(EC.element_to_be_clickable((By.XPATH, xp)))
                                                driver.execute_script("arguments[0].click();", el)
                                                clicked = True
                                                break
                                            except Exception:
                                                continue
                                        if not clicked:
                                            # fallback
                                            driver.back()
                                        # wait to ensure list is present again (longer wait)
                                        try:
                                            WebDriverWait(driver, 8).until(EC.presence_of_all_elements_located((By.CSS_SELECTOR, "ul.control-group.no-bullets")))
                                            remover_tela_carregamento(driver)
                                            time.sleep(1.2)
                                        except Exception:
                                            time.sleep(1.2)
                                    except Exception:
                                        pass

                            results.append({
                                "Cidade": cidade_id or "",
                                "Modalidade": modalidade_id or "",
                                "Descritivo": descritivo,
                                "Valor": valor,
                                "Aceita Financiamento": aceita_financiamento,
                                "Aceita Parcelamento": aceita_parcelamento,
                                "Quartos": quartos_encontrados,
                                "Vagas": vagas_encontradas,
                                "Endereço": endereco_text,
                                "Foto": foto_url,
                                "Matrícula": matricula_url,
                                "Edital": edital_url,
                            })

                        except Exception:
                            continue

                    # next page
                    try:
                        pagina_atual += 1
                        proxima_pagina = driver.find_element(By.XPATH, f'//a[contains(@href,"carregaListaImoveis({pagina_atual});")]')
                        driver.execute_script("arguments[0].click();", proxima_pagina)
                        time.sleep(1)
                    except Exception:
                        break

    finally:
        try:
            driver.quit()
        except Exception:
            pass

    return results


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--modalidades', type=str, default="")
    parser.add_argument('--cidades', type=str, default="")
    parser.add_argument('--faixa_valor', type=str, default="")
    parser.add_argument('--tipo_imovel', type=str, default="")
    parser.add_argument('--quartos', type=str, default="")
    parser.add_argument('--vagas', type=str, default="")
    parser.add_argument('--area_util', type=str, default="")
    parser.add_argument('--verificar_financiamento', action='store_true')

    args = parser.parse_args()
    modalidades = parse_modalidades(args.modalidades)
    cidades = parse_cidades(args.cidades)

    rows = extract_from_caixa(modalidades, cidades, args.faixa_valor, args.tipo_imovel, args.quartos, args.vagas, args.area_util, args.verificar_financiamento)
    print(json.dumps(rows, ensure_ascii=False))
