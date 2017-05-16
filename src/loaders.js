'use strict';

function getTexture (url, resolve) {
	// construct absolute url
	if (url && !url.startsWith('http') && !url.startsWith('//')) {
		if (url.startsWith('/')) {
			url = location.origin + url;
		}
		else {
			var currPath = location.pathname;
			if (!currPath.endsWith('/')) {
				currPath = location.pathname.split('/').slice(0, -1).join('/') + '/';
			}
			url = location.origin + currPath + url;
		}
	}
	console.info('Allowing Altspace to load ' + url);
	var image = {src: url};
	var tex = new THREE.Texture(image);
	if (resolve) {
		resolve(tex);
	}
	return tex;
}

if(altspace.inClient)
{
	let noop = () => {};
	THREE.Loader.Handlers.add(/jpe?g|png/i, { load: getTexture, setCrossOrigin: noop });
	THREE.TextureLoader.prototype.load = getTexture;
}

let cache = {models: {}, textures: {}, posters: {}};

function ModelPromise(url)
{
	return new Promise((resolve, reject) =>
	{
		if(cache.models[url]){
			return resolve(cache.models[url]);
		}

		// NOTE: glTF loader does not catch errors
		else if(/\.gltf$/i.test(url)){
			if(THREE.glTFLoader){
				let loader = new THREE.glTFLoader();
				loader.load(url, (result) => {
					cache.models[url] = result.scene.children[0].children[0];
					return resolve(cache.models[url]);
				});
			}
			else if(THREE.GLTFLoader){
				let loader = new THREE.GLTFLoader();
				loader.load(url, result => {
					cache.models[url] = result.scene.children[0];
					cache.models[url].matrixAutoUpdate = true;
					/*result.scene.traverse((o) => {
						if(o.material && o.material.map)
							console.log('flipY', o.material.map.flipY);
					});*/


					return resolve(cache.models[url]);
				}, () => {}, reject);
			}
			else {
				console.error(`glTF loader not found. "${url}" not loaded.`);
				reject();
			}
		}

		else if(/\.dae$/i.test(url)){
			if(THREE.ColladaLoader){
				let loader = new THREE.ColladaLoader();
				loader.load(url, result => {
					cache.models[url] = result.scene.children[0];
					return resolve(result.scene.children[0])
				}, null, reject);
			}
			else {
				console.error(`Collada loader not found. "${url}" not loaded.`);
				reject();
			}
		}
	});
}

function TexturePromise(url){
	return new Promise((resolve, reject) =>
	{
		if(cache.textures[url])
			return resolve(cache.textures[url]);
		else {
			let loader = new THREE.TextureLoader();
			loader.load(url, texture => {
				cache.textures[url] = texture;
				return resolve(texture);
			}, null, reject);
		}
	});
}

class VideoPromise extends Promise {
	constructor(url)
	{
		// start loader
		var vidSrc = document.createElement('video');
		vidSrc.autoplay = true;
		vidSrc.loop = true;
		vidSrc.src = url;
		vidSrc.style.display = 'none';
		document.body.appendChild(vidSrc);

		var tex = new THREE.VideoTexture(vidSrc);
		tex.minFilter = THREE.LinearFilter;
		tex.magFilter = THREE.LinearFilter;
		tex.format = THREE.RGBFormat;

		//cache.videos[url] = tex;
		//payload.videos[id] = cache.videos[url];

		return Promise.resolve(tex);
	}
}

function PosterPromise(url){
	return new Promise((resolve, reject) =>
	{
		if(cache.posters[url])
			return resolve(cache.posters[url]);
		else return (new TexturePromise(url)).then(tex =>
			{
				let ratio = tex.image.width / tex.image.height;
				let geo, mat = new THREE.MeshBasicMaterial({map: tex, side: THREE.DoubleSide});

				if(ratio > 1){
					geo = new THREE.PlaneGeometry(1, 1/ratio);
				}
				else {
					geo = new THREE.PlaneGeometry(ratio, 1);
				}

				cache.posters[url] = new THREE.Mesh(geo, mat);
				return resolve(cache.posters[url]);
			}
		);
	});
}

export { ModelPromise, TexturePromise, VideoPromise, PosterPromise, cache as _cache };
