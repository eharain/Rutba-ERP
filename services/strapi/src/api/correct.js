
const fs = require('fs');
const path = require('path');

const SRC_DIR = __dirname; // path.join(__dirname, 'src');

function walkDir(dir, callback) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(dirent => {
        const fullPath = path.join(dir, dirent.name);
        if (dirent.isDirectory()) {
            walkDir(fullPath, callback);
        } else {
            callback(fullPath);
        }
    });
}

walkDir(SRC_DIR, filePath => {
    const dir = filePath.substring(SRC_DIR.length + 1).split('\\')[0];
    if (filePath.endsWith('.js') && !filePath.endsWith('index.js') && !filePath.endsWith('correct.js') && !filePath.endsWith('term.js')) {

        const newFilePath = filePath.replace('term\.js', dir + '.js') //path.join(path.dirname(filePath), `${parentDir}.js`);
        const data = fs.readFileSync(filePath, 'utf8');
        const newContent = data.replace(/term/gi, dir);


        if (data != newContent) {
       // if (path.basename(filePath) === 'term.js') {
            //const parentDir = path.basename(path.dirname(filePath));
            const newFilePath = filePath.replace('term\.js', dir + '.js') //path.join(path.dirname(filePath), `${parentDir}.js`);
            const data = fs.readFileSync(filePath, 'utf8');

            const newContent = data.replace(/term/gi, dir);
            // console.log(`Updating file: ${filePath} -> ${newFilePath}`, newContent);
            // Write the updated content to the new file


            fs.writeFileSync(filePath, newContent, 'utf8');

            if (filePath != newFilePath) {
                fs.renameSync(filePath, newFilePath);
            }


            // Overwrite with new content
            //      fs.writeFileSync(newFilePath, newContent, 'utf8');

            console.log(dir, `Renamed and updated: ${filePath} -> ${newFilePath}`);
        }
    }
});
