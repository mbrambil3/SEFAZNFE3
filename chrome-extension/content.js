// Content script for SEFAZ NF-e Editor
console.log('SEFAZ NF-e Editor - Content script loaded in:', window.location.href);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('SEFAZ Editor - Message received:', request.action);
  
  switch (request.action) {
    case 'getProducts':
      getProducts().then(sendResponse);
      return true;
      
    case 'editProduct':
      editProduct(request.productCode, request.newQty).then(sendResponse);
      return true;
      
    case 'fillProductQty':
      fillProductQty(request.productCode, request.newQty).then(sendResponse);
      return true;
      
    case 'getTotalValue':
      getTotalValue().then(sendResponse);
      return true;
      
    case 'updateDate':
      updateDate(request.dateText).then(sendResponse);
      return true;
      
    case 'clickTab':
      clickTab(request.tabName).then(sendResponse);
      return true;
      
    case 'editPayment':
      editPayment(request.totalValue).then(sendResponse);
      return true;
      
    case 'fillPaymentValue':
      fillPaymentValue(request.totalValue).then(sendResponse);
      return true;
  }
});

// Get products from the table
async function getProducts() {
  try {
    console.log('SEFAZ Editor - Searching for products...');
    const products = [];
    
    const rows = document.querySelectorAll('tr');
    
    rows.forEach((row) => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 4) {
        const checkbox = row.querySelector('input[type="checkbox"]');
        const cellTexts = Array.from(cells).map(c => c.textContent.trim());
        
        let code = null;
        let description = null;
        let qty = null;
        let unitValue = null;
        let totalValue = null;
        
        for (let i = 0; i < cells.length; i++) {
          const text = cellTexts[i];
          const cell = cells[i];
          
          if (!code && text.match(/^\d{4}$/)) {
            code = text;
          } else if (!description && code) {
            const link = cell.querySelector('a');
            if (link) {
              description = link.textContent.trim();
            } else if (text.match(/^[A-ZÀ-Úa-zà-ú\s\-\.]+$/) && text.length > 1) {
              description = text;
            }
          } else if (!qty && text.match(/^\d+,\d{4}$/)) {
            qty = text;
          } else if (qty && !unitValue && text.match(/^\d+,\d{2,4}$/)) {
            unitValue = text;
          } else if (!totalValue && text.match(/^[\d\.]+,\d{2}$/)) {
            totalValue = text;
          }
        }
        
        if (code && description && checkbox) {
          products.push({
            index: products.length,
            code: code,
            description: description,
            currentQty: qty || '',
            unitValue: unitValue || '',
            totalValue: totalValue || '',
            newQty: ''
          });
          console.log('SEFAZ Editor - Found product:', code, description);
        }
      }
    });
    
    console.log('SEFAZ Editor - Total products found:', products.length);
    return { success: true, products };
    
  } catch (error) {
    console.error('SEFAZ Editor - Error:', error);
    return { success: false, error: error.message, products: [] };
  }
}

// Edit product - tries to open panel automatically
async function editProduct(productCode, newQty) {
  try {
    console.log('SEFAZ Editor - editProduct for code:', productCode, 'qty:', newQty);
    
    // First, check if edit panel is already open
    let qtyInput = findQtdComercialInput();
    
    if (qtyInput) {
      // Panel is open, fill the quantity
      return await fillAndSave(qtyInput, newQty, productCode);
    }
    
    // Panel is not open, try to open it
    console.log('SEFAZ Editor - Panel not open, trying to open...');
    
    // Find the product link with OpenlstDetItem
    const links = document.querySelectorAll('a');
    let openFunctionGuid = null;
    let productLink = null;
    
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      
      // Check if this link is in a row that contains our product code
      const row = link.closest('tr');
      if (row && row.textContent.includes(productCode)) {
        // Check if href contains OpenlstDetItem
        if (href.includes('OpenlstDetItem')) {
          productLink = link;
          // Extract the GUID from OpenlstDetItem('guid')
          const match = href.match(/OpenlstDetItem\(['"]([^'"]+)['"]\)/);
          if (match) {
            openFunctionGuid = match[1];
            console.log('SEFAZ Editor - Found OpenlstDetItem GUID:', openFunctionGuid);
          }
          break;
        }
      }
    }
    
    if (openFunctionGuid) {
      // Return the GUID so popup can execute it using chrome.scripting
      return { 
        success: false, 
        needsScriptExecution: true, 
        guid: openFunctionGuid,
        productCode: productCode,
        newQty: newQty
      };
    }
    
    return { success: false, error: 'Abra o painel do produto manualmente' };
    
  } catch (error) {
    console.error('SEFAZ Editor - Error:', error);
    return { success: false, error: error.message };
  }
}

// Just fill and save (called after panel is opened)
async function fillProductQty(productCode, newQty) {
  try {
    console.log('SEFAZ Editor - fillProductQty for:', productCode, newQty);
    
    let qtyInput = findQtdComercialInput();
    
    if (!qtyInput) {
      // Wait a bit more for panel to fully load
      await sleep(1000);
      qtyInput = findQtdComercialInput();
    }
    
    if (!qtyInput) {
      return { success: false, error: 'Campo Qtd. Comercial não encontrado' };
    }
    
    return await fillAndSave(qtyInput, newQty, productCode);
    
  } catch (error) {
    console.error('SEFAZ Editor - Error:', error);
    return { success: false, error: error.message };
  }
}

// Fill quantity and save
async function fillAndSave(qtyInput, newQty, productCode) {
  console.log('SEFAZ Editor - Filling qty input, current value:', qtyInput.value);
  
  qtyInput.focus();
  await sleep(100);
  qtyInput.select();
  await sleep(50);
  
  // Format quantity with 4 decimal places
  let formattedQty = newQty.replace('.', ',');
  if (!formattedQty.includes(',')) {
    formattedQty = formattedQty + ',0000';
  } else {
    const parts = formattedQty.split(',');
    formattedQty = parts[0] + ',' + (parts[1] || '').padEnd(4, '0').substring(0, 4);
  }
  
  qtyInput.value = '';
  await sleep(50);
  qtyInput.value = formattedQty;
  
  qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
  qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
  qtyInput.dispatchEvent(new Event('blur', { bubbles: true }));
  
  console.log('SEFAZ Editor - Quantity set to:', formattedQty);
  await sleep(300);
  
  // Click Salvar Item
  const saveBtn = findButton('Salvar Item');
  if (saveBtn) {
    console.log('SEFAZ Editor - Clicking Salvar Item');
    saveBtn.click();
    await sleep(2000);
    console.log('SEFAZ Editor - Product', productCode, 'saved!');
    return { success: true };
  } else {
    return { success: false, error: 'Botão Salvar Item não encontrado' };
  }
}

// Find the Qtd. Comercial input
function findQtdComercialInput() {
  // Look for TD with "*Qtd. Comercial:" and get the input in the next TD
  const allTds = document.querySelectorAll('td');
  
  for (const td of allTds) {
    const text = td.textContent.trim();
    
    if (text === '*Qtd. Comercial:' || text === 'Qtd. Comercial:' || text === '*Qtd Comercial:') {
      let nextTd = td.nextElementSibling;
      if (nextTd && nextTd.tagName === 'TD') {
        const input = nextTd.querySelector('input[type="text"], input:not([type])');
        if (input && !input.readOnly && !input.disabled) {
          return input;
        }
      }
    }
  }
  
  // Fallback: find input with qty pattern (XX,0000) after finding Valor Unit
  const allInputs = document.querySelectorAll('input[type="text"]');
  let foundValorUnit = false;
  
  for (const input of allInputs) {
    const parentTd = input.closest('td');
    if (parentTd) {
      const prevTd = parentTd.previousElementSibling;
      if (prevTd) {
        const prevText = prevTd.textContent.trim();
        if (prevText.includes('Valor Unit')) {
          foundValorUnit = true;
          continue;
        }
        if (prevText.includes('Qtd') && prevText.includes('Comercial') && !prevText.includes('Valor')) {
          return input;
        }
      }
    }
    
    if (foundValorUnit && input.value && input.value.match(/^\d+,\d{4}$/)) {
      return input;
    }
  }
  
  return null;
}

// Get total value from "Total" tab > "*Total Nota Fiscal:"
async function getTotalValue() {
  try {
    console.log('SEFAZ Editor - Getting total value...');
    
    // Look for "*Total Nota Fiscal:" label and get the value next to it
    const allTds = document.querySelectorAll('td');
    
    for (const td of allTds) {
      const text = td.textContent.trim();
      
      if (text.includes('Total Nota Fiscal') || text === '*Total Nota Fiscal:') {
        // Get the next TD or input
        const nextTd = td.nextElementSibling;
        if (nextTd) {
          const input = nextTd.querySelector('input');
          if (input && input.value) {
            console.log('SEFAZ Editor - Found total in input:', input.value);
            return { success: true, totalValue: input.value };
          }
          
          const text = nextTd.textContent.trim();
          if (text && text.match(/[\d\.,]+/)) {
            console.log('SEFAZ Editor - Found total in text:', text);
            return { success: true, totalValue: text };
          }
        }
        
        // Check same row for inputs
        const row = td.closest('tr');
        if (row) {
          const inputs = row.querySelectorAll('input');
          for (const inp of inputs) {
            if (inp.value && inp.value.match(/[\d\.,]+/)) {
              console.log('SEFAZ Editor - Found total in row input:', inp.value);
              return { success: true, totalValue: inp.value };
            }
          }
        }
      }
    }
    
    // Fallback: sum products from table
    let total = 0;
    const processedCodes = new Set();
    const rows = document.querySelectorAll('tr');
    
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      const cellTexts = Array.from(cells).map(c => c.textContent.trim());
      const rowText = cellTexts.join('|');
      
      const codeMatch = rowText.match(/\|(\d{4})\|/);
      if (codeMatch && !processedCodes.has(codeMatch[1])) {
        processedCodes.add(codeMatch[1]);
        
        for (let i = cellTexts.length - 1; i >= 0; i--) {
          if (cellTexts[i].match(/^[\d\.]+,\d{2}$/)) {
            total += parseValue(cellTexts[i]);
            break;
          }
        }
      }
    }
    
    const formattedTotal = formatCurrency(total);
    console.log('SEFAZ Editor - Calculated total:', formattedTotal);
    return { success: true, totalValue: formattedTotal };
    
  } catch (error) {
    console.error('SEFAZ Editor - Error:', error);
    return { success: false, error: error.message, totalValue: '0,00' };
  }
}

// Update date in Observação tab
async function updateDate(dateText) {
  try {
    console.log('SEFAZ Editor - Updating date to:', dateText);
    
    const textareas = document.querySelectorAll('textarea');
    let targetTextarea = null;
    
    // Find "Informações Complementares de interesse do Contribuinte" textarea
    const allTds = document.querySelectorAll('td');
    for (const td of allTds) {
      const text = td.textContent.trim();
      if (text.includes('Complementares') && text.includes('Contribuinte')) {
        const row = td.closest('tr');
        if (row) {
          const textarea = row.querySelector('textarea');
          if (textarea) {
            targetTextarea = textarea;
            break;
          }
          const nextRow = row.nextElementSibling;
          if (nextRow) {
            const ta = nextRow.querySelector('textarea');
            if (ta) {
              targetTextarea = ta;
              break;
            }
          }
        }
      }
    }
    
    // Fallback: find textarea with date pattern or second textarea
    if (!targetTextarea) {
      for (const ta of textareas) {
        if (ta.value && ta.value.match(/De \d{2}\/\d{2} a \d{2}\/\d{2}/)) {
          targetTextarea = ta;
          break;
        }
      }
    }
    
    if (!targetTextarea && textareas.length >= 2) {
      targetTextarea = textareas[1];
    }
    
    if (!targetTextarea && textareas.length > 0) {
      targetTextarea = textareas[textareas.length - 1];
    }
    
    if (targetTextarea) {
      targetTextarea.focus();
      targetTextarea.value = dateText;
      targetTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      targetTextarea.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('SEFAZ Editor - Date updated');
      return { success: true };
    }
    
    return { success: false, error: 'Campo não encontrado' };
    
  } catch (error) {
    console.error('SEFAZ Editor - Error:', error);
    return { success: false, error: error.message };
  }
}

// Click a tab by name
async function clickTab(tabName) {
  try {
    console.log('SEFAZ Editor - Clicking tab:', tabName);
    
    const elements = document.querySelectorAll('a, td, span, div');
    
    for (const el of elements) {
      const text = el.textContent.trim();
      if (text === tabName || text.includes(tabName)) {
        const isTab = el.tagName === 'A' || 
                      el.onclick || 
                      el.getAttribute('onclick') ||
                      el.closest('[onclick]');
        
        if (isTab || el.tagName === 'TD') {
          el.click();
          console.log('SEFAZ Editor - Tab clicked:', tabName);
          await sleep(500);
          return { success: true };
        }
      }
    }
    
    return { success: false, error: 'Aba não encontrada' };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Get payment info (find the link with guid for editing)
async function getPaymentInfo() {
  try {
    console.log('SEFAZ Editor - Getting payment info...');
    
    // Find payment row with checkbox
    const rows = document.querySelectorAll('tr');
    
    for (const row of rows) {
      const checkbox = row.querySelector('input[type="checkbox"]');
      const links = row.querySelectorAll('a');
      
      // Check if this looks like a payment row (has "Dinheiro" or similar)
      const rowText = row.textContent;
      if (checkbox && (rowText.includes('Dinheiro') || rowText.includes('Pagamento') || rowText.match(/\d+,\d{2}/))) {
        // Find the link with OpenlstDetItem or similar
        for (const link of links) {
          const href = link.getAttribute('href') || '';
          if (href.includes('Openlst') || href.includes('javascript:')) {
            const match = href.match(/Openlst[^']*\(['"]([^'"]+)['"]\)/);
            if (match) {
              console.log('SEFAZ Editor - Found payment GUID:', match[1]);
              return { success: true, guid: match[1], hasPayment: true };
            }
          }
        }
        
        // If no link found, just return that we have a payment row
        return { success: true, hasPayment: true, guid: null };
      }
    }
    
    return { success: false, hasPayment: false };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Edit payment value - same robust approach as products
async function editPayment(totalValue) {
  try {
    console.log('SEFAZ Editor - editPayment with value:', totalValue);
    
    // Check if we're already in the payment edit panel
    let valorInput = findValorPagamentoInput();
    
    if (valorInput) {
      console.log('SEFAZ Editor - Payment panel already open');
      return await fillPaymentAndSave(valorInput, totalValue);
    }
    
    // Not in edit panel - find the payment row and its link
    console.log('SEFAZ Editor - Payment panel not open, looking for payment link...');
    
    const rows = document.querySelectorAll('tr');
    let paymentGuid = null;
    
    for (const row of rows) {
      const rowText = row.textContent;
      
      // Look for payment row (contains "Dinheiro" or payment value pattern)
      if (rowText.includes('Dinheiro') || rowText.includes('Pagamento à Vista') || rowText.match(/\d{1,3}(\.\d{3})*,\d{2}/)) {
        const links = row.querySelectorAll('a');
        
        for (const link of links) {
          const href = link.getAttribute('href') || '';
          console.log('SEFAZ Editor - Found payment link href:', href);
          
          // Extract GUID from any Openlst function (OpenlstDetPag, OpenlstDetItem, etc.)
          const match = href.match(/Openlst[A-Za-z]*\(['"]([^'"]+)['"]\)/);
          if (match) {
            paymentGuid = match[1];
            // Also get the function name
            const funcMatch = href.match(/(Openlst[A-Za-z]*)\(/);
            const funcName = funcMatch ? funcMatch[1] : 'OpenlstDetPag';
            
            console.log('SEFAZ Editor - Found payment GUID:', paymentGuid, 'function:', funcName);
            
            return { 
              success: false, 
              needsScriptExecution: true, 
              guid: paymentGuid,
              functionName: funcName,
              totalValue: totalValue
            };
          }
        }
      }
    }
    
    // If no link found, try selecting checkbox and clicking Editar button
    console.log('SEFAZ Editor - No payment link found, trying checkbox + Editar');
    
    for (const row of rows) {
      const checkbox = row.querySelector('input[type="checkbox"]');
      const rowText = row.textContent;
      
      if (checkbox && (rowText.includes('Dinheiro') || rowText.match(/\d+,\d{2}/))) {
        // Select the checkbox
        if (!checkbox.checked) {
          checkbox.checked = true;
          checkbox.click();
          await sleep(500);
        }
        
        // Click Editar button
        const editBtn = findButton('Editar');
        if (editBtn) {
          console.log('SEFAZ Editor - Clicking Editar button');
          editBtn.click();
          await sleep(2500);
          
          valorInput = findValorPagamentoInput();
          if (valorInput) {
            return await fillPaymentAndSave(valorInput, totalValue);
          }
        }
        break;
      }
    }
    
    return { success: false, error: 'Não foi possível abrir o painel de pagamento' };
    
  } catch (error) {
    console.error('SEFAZ Editor - Error:', error);
    return { success: false, error: error.message };
  }
}

// Fill payment after panel is opened
async function fillPaymentValue(totalValue) {
  try {
    console.log('SEFAZ Editor - fillPaymentValue:', totalValue);
    
    // Wait for panel to fully load
    await sleep(2000);
    
    let valorInput = findValorPagamentoInput();
    
    if (!valorInput) {
      console.log('SEFAZ Editor - Valor input not found, waiting more...');
      await sleep(2000);
      valorInput = findValorPagamentoInput();
    }
    
    if (!valorInput) {
      return { success: false, error: 'Campo Valor do Pagamento não encontrado' };
    }
    
    return await fillPaymentAndSave(valorInput, totalValue);
    
  } catch (error) {
    console.error('SEFAZ Editor - Error:', error);
    return { success: false, error: error.message };
  }
}

// Find "Valor do Pagamento" input
function findValorPagamentoInput() {
  console.log('SEFAZ Editor - Looking for Valor do Pagamento field...');
  
  const allTds = document.querySelectorAll('td');
  
  for (const td of allTds) {
    const text = td.textContent.trim();
    
    if (text === 'Valor do Pagamento:' || text.includes('Valor do Pagamento')) {
      console.log('SEFAZ Editor - Found Valor do Pagamento label');
      
      // Check next TD
      let nextTd = td.nextElementSibling;
      if (nextTd && nextTd.tagName === 'TD') {
        const input = nextTd.querySelector('input[type="text"], input:not([type="checkbox"]):not([type="hidden"]):not([type="button"])');
        if (input && !input.readOnly && !input.disabled) {
          console.log('SEFAZ Editor - Found Valor input in next TD, value:', input.value);
          return input;
        }
      }
      
      // Check same row
      const row = td.closest('tr');
      if (row) {
        const inputs = row.querySelectorAll('input[type="text"]');
        for (const inp of inputs) {
          if (!inp.readOnly && !inp.disabled) {
            console.log('SEFAZ Editor - Found Valor input in row, value:', inp.value);
            return inp;
          }
        }
      }
    }
  }
  
  // Fallback: look for input with payment value pattern
  const allInputs = document.querySelectorAll('input[type="text"]');
  for (const inp of allInputs) {
    if (inp.value && inp.value.match(/^\d{1,3}(\.\d{3})*,\d{2}$/) && !inp.readOnly) {
      const parentText = inp.closest('tr')?.textContent || '';
      if (parentText.includes('Pagamento') || parentText.includes('Valor')) {
        console.log('SEFAZ Editor - Found Valor input by pattern, value:', inp.value);
        return inp;
      }
    }
  }
  
  console.log('SEFAZ Editor - Valor do Pagamento input NOT found');
  return null;
}

// Fill payment value and save
async function fillPaymentAndSave(valorInput, totalValue) {
  console.log('SEFAZ Editor - Filling payment, current value:', valorInput.value, 'new value:', totalValue);
  
  valorInput.focus();
  await sleep(100);
  valorInput.select();
  await sleep(50);
  
  // Format the value (remove R$ if present)
  let formattedValue = totalValue.replace('R$', '').replace(/\s/g, '').trim();
  
  // Clear and set new value
  valorInput.value = '';
  await sleep(50);
  valorInput.value = formattedValue;
  
  // Trigger events
  valorInput.dispatchEvent(new Event('input', { bubbles: true }));
  valorInput.dispatchEvent(new Event('change', { bubbles: true }));
  valorInput.dispatchEvent(new Event('blur', { bubbles: true }));
  
  console.log('SEFAZ Editor - Payment value set to:', formattedValue);
  await sleep(500);
  
  // Click Salvar button
  const saveBtn = findButton('Salvar');
  if (saveBtn) {
    console.log('SEFAZ Editor - Clicking Salvar');
    saveBtn.click();
    await sleep(2500);
    console.log('SEFAZ Editor - Payment saved!');
    return { success: true };
  }
  
  return { success: false, error: 'Botão Salvar não encontrado' };
}

// Helper functions
function findButton(text) {
  const inputs = document.querySelectorAll('input[type="button"], input[type="submit"]');
  for (const inp of inputs) {
    if (inp.value && inp.value.includes(text)) return inp;
  }
  
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    if (btn.textContent && btn.textContent.includes(text)) return btn;
  }
  
  const links = document.querySelectorAll('a');
  for (const link of links) {
    if (link.textContent && link.textContent.includes(text)) return link;
  }
  
  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseValue(str) {
  if (!str) return 0;
  const cleaned = str.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

function formatCurrency(value) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
