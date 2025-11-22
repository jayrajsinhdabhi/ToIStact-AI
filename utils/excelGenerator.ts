import { Dimension, DimensionType } from '../types';

// Function to escape special characters for XML
const escapeXML = (str: string | undefined): string => {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

export const generateExcelFile = (dimensions: Dimension[]) => {
  // We use the XML Spreadsheet 2003 format. 
  // Using .xml extension avoids "File format and extension don't match" errors in modern Excel.
  
  const timestamp = new Date().toISOString().split('T')[0];
  const fileName = `ToleranceStack_${timestamp}.xml`; 

  const rowCount = dimensions.length;
  
  // Styles for the Excel sheet
  // Note: No whitespace before <?xml ... ?> is allowed.
  const styles = `<Styles>
   <Style ss:ID="Default" ss:Name="Normal">
    <Alignment ss:Vertical="Bottom"/>
    <Borders/>
    <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#000000"/>
    <Interior/>
    <NumberFormat/>
    <Protection/>
   </Style>
   <Style ss:ID="sHeader">
    <Alignment ss:Horizontal="Center" ss:Vertical="Bottom"/>
    <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
    <Interior ss:Color="#4472C4" ss:Pattern="Solid"/>
   </Style>
   <Style ss:ID="sResultLabel">
    <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#333333" ss:Bold="1"/>
    <Alignment ss:Horizontal="Right"/>
   </Style>
   <Style ss:ID="sResultValue">
    <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#000000" ss:Bold="1"/>
    <NumberFormat ss:Format="0.000"/>
    <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    </Borders>
   </Style>
   <Style ss:ID="sCalculated">
    <Font ss:Color="#666666"/>
    <Interior ss:Color="#F2F2F2" ss:Pattern="Solid"/>
   </Style>
  </Styles>`;

  // Header Row
  let rows = `<Row>
    <Cell ss:StyleID="sHeader"><Data ss:Type="String">Component Name</Data></Cell>
    <Cell ss:StyleID="sHeader"><Data ss:Type="String">Description</Data></Cell>
    <Cell ss:StyleID="sHeader"><Data ss:Type="String">Nominal</Data></Cell>
    <Cell ss:StyleID="sHeader"><Data ss:Type="String">Tol (+)</Data></Cell>
    <Cell ss:StyleID="sHeader"><Data ss:Type="String">Tol (-)</Data></Cell>
    <Cell ss:StyleID="sHeader"><Data ss:Type="String">Type</Data></Cell>
    <Cell ss:StyleID="sHeader"><Data ss:Type="String">Sign (Calc)</Data></Cell>
    <Cell ss:StyleID="sHeader"><Data ss:Type="String">Eff. Nominal</Data></Cell>
    <Cell ss:StyleID="sHeader"><Data ss:Type="String">WC Max Part</Data></Cell>
    <Cell ss:StyleID="sHeader"><Data ss:Type="String">WC Min Part</Data></Cell>
    <Cell ss:StyleID="sHeader"><Data ss:Type="String">Avg Tol Sq</Data></Cell>
   </Row>`;

  // Data Rows
  dimensions.forEach((d) => {
    // Excel Formulas (R1C1 style)
    
    // G (Col 7) Sign: =IF(RC[-1]="INCREASING", 1, -1)
    const formulaSign = `=IF(RC[-1]="${DimensionType.INCREASING}",1,-1)`;
    
    // H (Col 8) Eff Nominal: =RC[-5]*RC[-1]  (Nominal * Sign)
    const formulaEffNom = `=RC[-5]*RC[-1]`;
    
    // I (Col 9) WC Max Part: =IF(Sign=1, Nom+Tol+, -(Nom-Tol-))
    // Sign is RC[-2] (Col 7), Nominal RC[-6], Tol+ RC[-5], Tol- RC[-4]
    const formulaWCMax = `=IF(RC[-2]=1, RC[-6]+RC[-5], -(RC[-6]-RC[-4]))`;

    // J (Col 10) WC Min Part: =IF(Sign=1, Nom-Tol-, -(Nom+Tol+))
    // Sign is RC[-3] (Col 7), Nominal RC[-7], Tol+ RC[-6], Tol- RC[-5]
    const formulaWCMin = `=IF(RC[-3]=1, RC[-7]-RC[-5], -(RC[-7]+RC[-6]))`;

    // K (Col 11) Avg Tol Sq: =((Tol+ + Tol-)/2)^2
    // Tol+ is RC[-7] (Col 4), Tol- is RC[-6] (Col 5)
    const formulaRSS = `=((RC[-7]+RC[-6])/2)^2`;

    rows += `<Row>
     <Cell><Data ss:Type="String">${escapeXML(d.name)}</Data></Cell>
     <Cell><Data ss:Type="String">${escapeXML(d.description)}</Data></Cell>
     <Cell><Data ss:Type="Number">${d.nominal}</Data></Cell>
     <Cell><Data ss:Type="Number">${d.tolerancePlus}</Data></Cell>
     <Cell><Data ss:Type="Number">${d.toleranceMinus}</Data></Cell>
     <Cell><Data ss:Type="String">${d.type}</Data></Cell>
     <Cell ss:StyleID="sCalculated" ss:Formula="${formulaSign}"><Data ss:Type="Number">${d.type === DimensionType.INCREASING ? 1 : -1}</Data></Cell>
     <Cell ss:StyleID="sCalculated" ss:Formula="${formulaEffNom}"><Data ss:Type="Number">0</Data></Cell>
     <Cell ss:StyleID="sCalculated" ss:Formula="${formulaWCMax}"><Data ss:Type="Number">0</Data></Cell>
     <Cell ss:StyleID="sCalculated" ss:Formula="${formulaWCMin}"><Data ss:Type="Number">0</Data></Cell>
     <Cell ss:StyleID="sCalculated" ss:Formula="${formulaRSS}"><Data ss:Type="Number">0</Data></Cell>
    </Row>`;
  });

  const startRow = 2;
  const endRow = dimensions.length + 1;

  // Summary Section (Two rows gap)
  rows += `<Row></Row><Row></Row>`;
  
  // Formulas for Summary (Summing up the calculated columns)
  // Nominal Gap (Sum Col 8)
  // WC Max (Sum Col 9)
  // WC Min (Sum Col 10)
  // RSS Sigma: SQRT(Sum Col 11)

  rows += `<Row>
    <Cell ss:StyleID="sResultLabel" ss:Index="2"><Data ss:Type="String">Calculated Nominal Gap:</Data></Cell>
    <Cell ss:StyleID="sResultValue" ss:Formula="=SUM(R${startRow}C8:R${endRow}C8)"><Data ss:Type="Number">0</Data></Cell>
   </Row>
   <Row>
    <Cell ss:StyleID="sResultLabel" ss:Index="2"><Data ss:Type="String">Worst Case Max:</Data></Cell>
    <Cell ss:StyleID="sResultValue" ss:Formula="=SUM(R${startRow}C9:R${endRow}C9)"><Data ss:Type="Number">0</Data></Cell>
   </Row>
   <Row>
    <Cell ss:StyleID="sResultLabel" ss:Index="2"><Data ss:Type="String">Worst Case Min:</Data></Cell>
    <Cell ss:StyleID="sResultValue" ss:Formula="=SUM(R${startRow}C10:R${endRow}C10)"><Data ss:Type="Number">0</Data></Cell>
   </Row>
   <Row>
    <Cell ss:StyleID="sResultLabel" ss:Index="2"><Data ss:Type="String">RSS Range (3 Sigma):</Data></Cell>
    <Cell ss:StyleID="sResultValue" ss:Formula="=SQRT(SUM(R${startRow}C11:R${endRow}C11))*3"><Data ss:Type="Number">0</Data></Cell>
    <Cell><Data ss:Type="String">(± value)</Data></Cell>
   </Row>`;

  const xmlContent = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 ${styles}
 <Worksheet ss:Name="Stackup Analysis">
  <Table ss:ExpandedColumnCount="20" ss:ExpandedRowCount="${dimensions.length + 50}" x:FullColumns="1" x:FullRows="1">
   <Column ss:Width="150"/>
   <Column ss:Width="150"/>
   <Column ss:Width="60"/>
   <Column ss:Width="60"/>
   <Column ss:Width="60"/>
   <Column ss:Width="80"/>
   <Column ss:Width="40"/>
   <Column ss:Width="80"/>
   <Column ss:Width="80"/>
   <Column ss:Width="80"/>
   <Column ss:Width="80"/>
   ${rows}
  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xmlContent], { type: 'application/xml' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
