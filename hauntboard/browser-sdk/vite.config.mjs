import {defineConfig} from 'vite';
import wasm from 'vite-plugin-wasm';
export default defineConfig({plugins:[wasm()],build:{target:'esnext',outDir:'../web/vendor',emptyOutDir:true,lib:{entry:'src.mjs',formats:['es'],fileName:()=> 'wallet-sdk.mjs'},minify:true}});
