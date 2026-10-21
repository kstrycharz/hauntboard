import { defineConfig } from 'vite';
export default defineConfig({build:{target:'es2022',outDir:'../web/vendor',emptyOutDir:false,lib:{entry:'hpke-src.mjs',formats:['es'],fileName:()=> 'hpke.mjs'},rollupOptions:{output:{inlineDynamicImports:true}},minify:true}});
