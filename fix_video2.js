const fs = require('fs');
const path = require('path');

const directory = path.join(__dirname, 'views');
const files = ['service2.ejs', 'service3.ejs', 'service4.ejs', 'service5.ejs', 'service6.ejs'];

for (const file of files) {
    const filePath = path.join(directory, file);
    let content = fs.readFileSync(filePath, 'utf8');

    const regex = /\/\*\s*──\s*Mobile\/Tablet:\s*force\s*vertical\s*video\s*──\s*\*\/\s*@media\s*\(max-width:\s*991px\)\s*\{\s*\.hero-fullwidth\s*\{\s*height:\s*100vh\s*!important;\s*\}\s*\.hero-fullwidth\s*video\s*\{\s*object-fit:\s*cover\s*!important;\s*\}\s*\}/g;

    const replacement = `/* ── Mobile/Tablet: landscape video ── */
              @media (max-width: 991px) {
                .hero-fullwidth {
                  height: auto !important;
                  aspect-ratio: 16 / 9;
                }

                .hero-fullwidth video {
                  object-fit: cover !important;
                }
              }`;

    if (regex.test(content)) {
        content = content.replace(regex, replacement);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${file}`);
    } else {
        console.log(`No match found in ${file}. Checking if it's slightly different...`);
    }
}
