const fs=require('node:fs');
fs.mkdirSync('dist',{recursive:true});
for(const file of ['index.html','styles.css','app.js','allocation.js'])fs.copyFileSync(file,'dist/'+file);
