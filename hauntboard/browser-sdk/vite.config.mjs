import {defineConfig} from 'vite';
import wasm from 'vite-plugin-wasm';
// Recovery glue and third-party licenses share this directory and must survive
// an SDK rebuild. Vite owns only the wallet-sdk output, not the whole directory.
export default defineConfig({plugins:[wasm()],build:{target:'esnext',outDir:'../web/vendor',emptyOutDir:false,lib:{entry:'src.mjs',formats:['es'],fileName:()=> 'wallet-sdk.mjs'},minify:true}});
