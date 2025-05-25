const fs = require('fs');
const path = require('path');

// Helper to sanitize and parse currency values like "$1,234.56"
function parseCurrency(value) {
  if (!value) return 0;
  return parseFloat(value.replace(/[$,]/g, '')) || 0;
}

function generateQIF(data) {
  const lines = ['!Type:Invst'];

  const actionMap = {
    'Reinvest Shares': 'NReinvDiv',
    'Reinvest Dividend': 'NReinvDiv',
    'Qual Div Reinvest': 'NReinvDiv',
    'Buy': 'NBuy',
    'Sell': 'NSell',
    'Cash Dividend': 'NDiv',
    'Qualified Dividend': 'NDiv',
    'Bank Interest': 'NMiscInc',
    'Misc Credits': 'NMiscInc',
    'MoneyLink Transfer': 'NMiscInc',
    'Foreign Tax Paid': 'NTax',
    'Security Transfer': 'NMiscInc', 
  };

  const descriptionMap = {
    'SCHWAB VALUE ADVANTAGE MONEY INVESTOR SHARES': 'SCHWAB VALUE ADVANTAGE MONEY INV',
    'SCHWAB PRIME ADVANTAGE MONEY INV': 'SCHWAB VALUE ADVANTAGE MONEY INV',
    'ISHARES CORE S&P TOTAL US STOCK MARK': 'ISHARES TOTAL US STOCK MARKET ETF',
  };

  (data.BrokerageTransactions || []).forEach(tx => {
    let qifAction = actionMap[tx.Action];

    if (!qifAction) {
      console.warn(`Skipping unsupported Action: ${tx.Action}`);
      return;
    }

    switch(qifAction) {
      case 'NReinvDiv':
        if (!tx.Quantity){
          qifAction = 'NDiv';
          tx.Description = 'CUR:USD';
        } else {
          qifAction = 'NBuy';
        }
        break;
    }

    switch(tx.Action) {
      case 'Security Transfer':
        if(tx.Quantity && !tx.Amount) {
          qifAction = 'NShrsIn'
        }
    }

    if (descriptionMap[tx.Description]) {
      tx.Description = descriptionMap[tx.Description];
    }

    lines.push(`D${tx.Date}`);
    lines.push(qifAction);

    if (
        qifAction === 'NMiscInc' ||
        qifAction === 'NXIn' ||
        qifAction === 'NDiv' ||
        qifAction === 'ShrsIn'
    ) {
      lines.push(`P${tx.Description}-${tx.Symbol}-${tx.Action}`);
    } else {
      if (tx.Description) lines.push(`Y${tx.Description}`);
      lines.push(`P${tx.Description}`);
    }

    if (tx.Quantity) lines.push(`Q${parseCurrency(tx.Quantity)}`);

    if (tx.Price) lines.push(`I${parseCurrency(tx.Price)}`);

    if (tx.Amount) {
      let amount = parseCurrency(tx.Amount);
      if(qifAction === 'NBuy') amount = amount * -1;
      lines.push(`U${amount}`);
      lines.push(`T${amount}`);
      if (qifAction === 'NXIn'){
        lines.push(`\$${amount}`);
        lines.push('L[InvestmentMatchingTransactionsFromPast]');
      }
	  }

    if (tx['Fees & Comm']) {
	    lines.push(`O${parseCurrency(tx['Fees & Comm'])}`);
    } else {
	    lines.push('O0.00');
    }

    lines.push('^');
  });

  return lines.join('\n');
}


// Main execution
(function main() {
  const inputFilePath = process.argv[2];

  if (!inputFilePath) {
    console.error('Usage: node convert-json-to-qif.js <path-to-json-file>');
    process.exit(1);
  }

  const resolvedPath = path.resolve(inputFilePath);
  const baseName = path.basename(resolvedPath, path.extname(resolvedPath));
  const dirName = path.dirname(resolvedPath);
  const outputFilePath = path.join(dirName, `${baseName}.qif`);

  try {
    const jsonContent = fs.readFileSync(resolvedPath, 'utf-8');
    const jsonData = JSON.parse(jsonContent);
    const qifOutput = generateQIF(jsonData);
    fs.writeFileSync(outputFilePath, qifOutput, 'utf-8');
    console.log(`QIF file written to: ${outputFilePath}`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
