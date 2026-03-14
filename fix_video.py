import os
import re

directory = r"d:\c\GAP-Repo-final-prathmesh (1) - Copy\GAP-Repo-final-prathmesh\views"
files = [f for f in os.listdir(directory) if f.startswith("service") and f.endswith(".ejs")]
files.remove("services.ejs")

pattern = re.compile(r'/\*\s*──\s*Mobile/Tablet:\s*force vertical video\s*──\s*\*/\s*@media\s*\(max-width:\s*991px\)\s*\{\s*\.thumb-main\s*\{\s*height:\s*100vh\s*!important;\s*\}\s*#heroVideo\s*\{\s*object-fit:\s*cover\s*!important;\s*\}\s*\}', re.DOTALL)

replacement = """/* ── Mobile/Tablet: landscape video ── */
                    @media (max-width: 991px) {
                      .thumb-main {
                        height: auto !important;
                        aspect-ratio: 16 / 9;
                      }

                      #heroVideo {
                        object-fit: cover !important;
                      }
                    }"""

for file_name in files:
    file_path = os.path.join(directory, file_name)
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    new_content = pattern.sub(replacement, content)
    
    if new_content != content:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Updated {file_name}")
    else:
        print(f"No match found in {file_name}")

