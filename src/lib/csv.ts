import {categories} from './finance';
import {transactionEditSchema} from './validation';
export type CsvMapping = {date:string; amount:string; type:string; category:string; note:string};
export type ImportRow = {date:string; amount:string; type:'income'|'expense'; category:string; note:string};
export function parseCsv(text:string):string[][] {
  if (text.length > 500000) throw new Error('Файл слишком большой. Максимум 500 КБ.');
  text=text.replace(/^\uFEFF/,'');
  const first=text.split(/\r?\n/,1)[0];
  const separator=(first.match(/;/g)||[]).length > (first.match(/,/g)||[]).length ? ';' : ',';
  const rows:string[][]=[]; let row:string[]=[]; let field=''; let quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') {if(quoted && text[i+1]==='"'){field+='"';i++;} else if(quoted || !field) quoted=!quoted; else throw new Error('Некорректные кавычки в CSV.');}
    else if(c===separator && !quoted) {row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted) {if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field='';}
    else field+=c;
    if(rows.length>501)throw new Error('Не более 500 операций за один импорт. Разделите файл.');
  }
  if(quoted)throw new Error('В CSV не закрыты кавычки.');
  row.push(field);if(row.some(x=>x.trim()))rows.push(row);
  if(rows.length<2 || rows.length>501)throw new Error('Нужны заголовки и от 1 до 500 операций.');
  rows[0]=rows[0].map(x=>x.trim());
  if(new Set(rows[0]).size!==rows[0].length || rows[0].some(x=>!x))throw new Error('Заголовки столбцов должны быть заполнены и уникальны.');
  if(rows.some(r=>r.length!==rows[0].length))throw new Error('Число столбцов различается. Проверьте разделители и кавычки.');
  return rows;
}
export function mapCsv(table:string[][], mapping:CsvMapping) {
  const rows:ImportRow[]=[]; const errors:string[]=[];
  for(const [index,cells] of table.slice(1).entries()) {
    const get=(key:keyof CsvMapping)=>cells[table[0].indexOf(mapping[key])]?.trim()||'';
    let date=get('date');if(/^\d{2}\.\d{2}\.\d{4}$/.test(date))date=date.split('.').reverse().join('-');
    const signed=get('amount').replace(/\s/g,''); const kind=get('type').toLowerCase();
    const type=kind ? ({'доход':'income','расход':'expense','income':'income','expense':'expense'} as Record<string,string>)[kind] : signed.startsWith('-')?'expense':'income';
    const input={date,amount:signed.replace(/^[-+]/,''),type,category:get('category')||'Другое',note:get('note')};
    const parsed=transactionEditSchema.safeParse(input);
    if(!parsed.success)errors.push(`Строка ${index+2}: проверьте дату, сумму, тип и категорию (${categories.join(', ')}).`);
    else rows.push(input as ImportRow);
  }
  return {rows,errors};
}
