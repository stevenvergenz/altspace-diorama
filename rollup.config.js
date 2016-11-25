import buble from 'rollup-plugin-buble';

export default {
	entry: 'src/main.js',
	dest: 'dist/diorama.js',
	format: 'iife',
	moduleName: 'Diorama',
	sourceMap: 'inline',
	plugins: [buble()]
};
