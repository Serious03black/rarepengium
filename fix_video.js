const fs = require('fs');
const path = require('path');

const directory = path.join(__dirname, 'views');
const files = fs.readdirSync(directory).filter(f => f.startsWith('service') && f.endsWith('.ejs') && f !== 'services.ejs');

for (const file of files) {
    const filePath = path.join(directory, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Use regex to locate the block to replace
    // Handles varying spaces/indentation
    const regex = /\/\*\s*──\s*Mobile\/Tablet:\s*force\s*vertical\s*video\s*──\s*\*\/\s*@media\s*\(max-width:\s*991px\)\s*\{\s*\.thumb-main\s*\{\s*height:\s*100vh\s*!important;\s*\}\s*#heroVideo\s*\{\s*object-fit:\s*cover\s*!important;\s*\}\s*\}/g;

    const replacement = `/* ── Mobile/Tablet: landscape video ── */
                    @media (max-width: 991px) {
                      .thumb-main {
                        height: auto !important;
                        aspect-ratio: 16 / 9;
                      }

                      #heroVideo {
                        object-fit: cover !important;
                      }
                    }`;

    if (regex.test(content)) {
        content = content.replace(regex, replacement);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${file}`);
    } else {
        console.log(`No match found in ${file}`);
    }
}
