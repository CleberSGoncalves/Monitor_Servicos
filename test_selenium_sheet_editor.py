import time
import os
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By

opts = Options()
opts.add_argument('--headless=new')
opts.add_argument('--no-sandbox')
opts.add_argument('--disable-gpu')
opts.add_argument('--window-size=1920,1080')

driver = webdriver.Chrome(options=opts)
try:
    file_path = 'file:///' + os.path.abspath(r'E:\desenvolvimento\Monitor_Esportes\docs\index.html').replace('\\', '/')
    driver.get(file_path)
    time.sleep(2)
    
    # Open sheet editor for SLA Interno
    driver.execute_script("openOnlineSheetEditor('Acomp. SLA Interno-Globo - Junho 2026.xlsx');")
    time.sleep(2)
    
    modal = driver.find_element(By.ID, 'modal-online-sheet-editor')
    print('Modal found:', bool(modal))
    modal_size = modal.size
    print('Modal size (should be 1920x1080):', modal_size)
    assert modal_size['width'] >= 1800, f"Expected width >= 1800, got {modal_size['width']}"
    assert modal_size['height'] >= 900, f"Expected height >= 900, got {modal_size['height']}"
    
    # Check tabs
    tabs = driver.find_elements(By.CSS_SELECTOR, '.btn-sheet-tab')
    print('Tab count:', len(tabs), [t.text for t in tabs])
    
    # Check fx formula bar
    fx = driver.find_element(By.ID, 'sheet-formula-bar')
    print('Formula bar found:', bool(fx))
    
    # Check desktop excel button
    btn_excel = driver.find_element(By.ID, 'btn-open-desktop-excel')
    print('Desktop Excel button found:', bool(btn_excel), btn_excel.text)
    
    # Check table rows
    rows = driver.find_elements(By.CSS_SELECTOR, '#online-sheet-table tbody tr')
    print('Rendered table row count:', len(rows))
    assert len(rows) > 0, 'No table rows rendered!'
    
    print('>>> SELENIUM TEST PASSED WITH 100% SUCCESS! <<<')
finally:
    driver.quit()
