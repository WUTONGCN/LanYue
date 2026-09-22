const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dest=path.join(root,'vendor/kkFileView'),pin='cd127fd8559970a28cd4d513f68e41b1bfdc966a';
if(!fs.existsSync(dest)){
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 execFileSync('git',['clone','--filter=blob:none','--no-checkout','https://github.com/kekingcn/kkFileView.git',dest],{stdio:'inherit'});
 execFileSync('git',['checkout','--detach',pin],{cwd:dest,stdio:'inherit'});
}
const actual=execFileSync('git',['rev-parse','HEAD'],{cwd:dest,encoding:'utf8'}).trim();
if(actual!==pin)throw new Error('Existing vendor checkout is not the pinned revision. Use a fresh directory.');
console.log('Upstream ready:',pin);
