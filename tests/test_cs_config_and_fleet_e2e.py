import time
import pytest
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC

def test_cs_config_and_fleet_navigation_e2e():
    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.set_capability("goog:loggingPrefs", {"browser": "ALL"})

    driver = webdriver.Chrome(options=chrome_options)
    try:
        driver.get("http://127.0.0.1:8092/")
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.ID, "navGroupInfra"))
        )

        time.sleep(2)

        # 1. Abre o dropdown navGroupInfra
        infra_group = driver.find_element(By.ID, "navGroupInfra")
        driver.execute_script("toggleNavDropdown('navGroupInfra');")
        time.sleep(0.5)

        # 2. Localiza e clica no item 'Configuração CS (ATRIA)' no dropdown
        cs_item = driver.find_element(By.CSS_SELECTOR, "#navGroupInfra .nav-dropdown-item[data-tab='fleet-csconfig']")
        assert cs_item is not None, "Botão Configuração CS (ATRIA) não encontrado no dropdown Infra & Frota"

        # Dispara clique no item
        driver.execute_script("arguments[0].click();", cs_item)

        # 3. Verifica se a aba Frota (tab-fleet) ficou ativa
        tab_fleet = driver.find_element(By.ID, "tab-fleet")
        WebDriverWait(driver, 5).until(lambda d: "active" in tab_fleet.get_attribute("class"))

        # 4. Verifica se o container de Configuração CS está visível
        cs_container = driver.find_element(By.ID, "fleetSubtabCSConfigContainer")
        WebDriverWait(driver, 5).until(lambda d: cs_container.is_displayed())
        assert cs_container.is_displayed(), "Container #fleetSubtabCSConfigContainer não está visível"

        # 5. Verifica se o botão da subaba ficou ativo
        btn_csconfig = driver.find_element(By.ID, "btn-fleet-subtab-csconfig")
        assert "active" in btn_csconfig.get_attribute("class"), "Botão #btn-fleet-subtab-csconfig não está ativo"

        # 6. Aguarda o seletor de praças ser populado com as praças do catálogo
        WebDriverWait(driver, 10).until(
            lambda d: len(d.find_elements(By.CSS_SELECTOR, "#subtabHostConfigPraca option")) > 5
        )
        sel_praca_el = driver.find_element(By.ID, "subtabHostConfigPraca")
        sel_praca = Select(sel_praca_el)
        options = [o.get_attribute("value") for o in sel_praca.options if o.get_attribute("value")]
        assert len(options) >= 50, f"Praças insuficientes no seletor: {len(options)}"
        print(f"[E2E PASS] Praças carregadas com sucesso: {len(options)} opções.")

        # 7. Seleciona a praça 'Ariquemes' ou a primeira praça disponível
        target_praca = "Ariquemes" if "Ariquemes" in options else options[0]
        sel_praca.select_by_value(target_praca)
        driver.execute_script("onSubtabCSPracaChange(arguments[0]);", target_praca)
        time.sleep(1)

        sel_machine_el = driver.find_element(By.ID, "subtabHostConfigMachine")
        sel_machine = Select(sel_machine_el)
        machine_options = [o.get_attribute("value") for o in sel_machine.options if o.get_attribute("value")]
        assert len(machine_options) > 0, f"Nenhuma máquina carregada para a praça {target_praca}"
        print(f"[E2E PASS] Máquinas carregadas para {target_praca}: {machine_options}")

        # 8. Testa alternância para subaba Governança
        btn_gov = driver.find_element(By.ID, "btn-fleet-subtab-governance")
        driver.execute_script("arguments[0].click();", btn_gov)
        time.sleep(0.5)
        gov_container = driver.find_element(By.ID, "fleetSubtabGovernanceContainer")
        assert gov_container.is_displayed(), "Container de Governança não visível após clique"
        assert not cs_container.is_displayed(), "Container de Configuração CS deveria estar oculto"

        # 9. Retorna para Configuração CS
        driver.execute_script("arguments[0].click();", btn_csconfig)
        time.sleep(0.5)
        assert cs_container.is_displayed(), "Container de Configuração CS não voltou a ficar visível"

        # 10. Verifica se houve erros fatais no console do navegador
        logs = driver.get_log("browser")
        severe_errors = [l for l in logs if l["level"] == "SEVERE" and "favicon" not in l["message"]]
        assert len(severe_errors) == 0, f"Erros SEVERE detectados no console: {severe_errors}"
        print("[E2E PASS] 0 erros no console do navegador!")

    finally:
        driver.quit()

if __name__ == "__main__":
    test_cs_config_and_fleet_navigation_e2e()
    print("ALL TESTS PASSED SUCCESSFULLY!")
