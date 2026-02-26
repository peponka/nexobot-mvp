const texts = [
    "Gs. 75.000",
    "Gs. 5 millones",
    "Gs. 1 millón",
    "Gs. 500 mil",
    "Gs. 5k",
    "Gs. 5M"
];

texts.forEach(t => {
    let clean = t.replace(/Gs\.\s*([\d.,]+)(?:\s*(millones|millón|mil|k|m))?/gi, (match, numb, suffix) => {
        return suffix ? `${numb} ${suffix} guaraníes` : `${numb} guaraníes`;
    });
    console.log(`${t} -> ${clean}`);
});
