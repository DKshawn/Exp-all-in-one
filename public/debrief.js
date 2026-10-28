export function debriefForShown(shown) {
  const notes=[];
  if(shown('09-03','feedback'))notes.push('分類課題で示した成績は、回答に関係なく設定された値です。あなたの能力を評価したものではありません。');
  if(shown('09-05','support-summary')||shown('09-05','oppose-summary'))notes.push('バス無料化についての研究報告と数値は、この課題のために作成した架空の情報です。');
  if(shown('23-01','history'))notes.push('歴史課題の結末は実験条件による表示で、一部は実際の歴史と異なります。英・グルカ戦争はイギリス側に有利な条約で終結しました。');
  return notes;
}
