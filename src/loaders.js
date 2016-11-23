'use strict';

class ModelPromise extends Promise {
	constructor(url){
		super((resolve, reject) => {
			// NOTE: glTF loader does not catch errors
			if(/\.gltf$/i.test(url)){
				if(THREE.glTFLoader){
					let loader = new THREE.glTFLoader();
					loader.load(url, (result) => {
						resolve(result.scene.children[0].children[0]);
					});
				}
				else {
					console.error(`THREE.glTFLoader not found. "${url}" not loaded.`);
					reject();
				}
			}
			else if(/\.dae$/i.test(url)){
				if(THREE.ColladaLoader){
					let loader = new THREE.ColladaLoader();
					loader.load(url, result => resolve(result.scene.children[0]), null, reject);
				}
				else {
					console.error(`THREE.ColladaLoader not found. "${url}" not loaded.`);
					reject();
				}
			}
		});
	}
}

class TexturePromise extends Promise {
	constructor(url){
		super((resolve, reject) =>
		{
			var loader = new THREE.TextureLoader();
			loader.load(url, resolve, null, reject);
		});
	}
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

class PosterPromise extends Promise {
	constructor(url){
		super((resolve, reject) => 
		{
			function onload(img)
			{
				let width = img.width, height = img.height, ratio = img.width/img.height;
				
				let tex = new THREE.Texture(img);
				let mat = new THREE.MeshBasicMaterial({map: tex, side: THREE.DoubleSide});
				let geo = new THREE.PlaneGeometry(...(ratio > 1 ? [1, 1/ratio] : [ratio, 1]));
				let mesh = new THREE.Mesh(geo, mat);
				
				resolve(mesh);
			}
			
			function onerror(e){
				reject(e);
			}
			
			let loader = new THREE.ImageLoader();
			loader.load(url, onload, null, onerror);
			
			
			
			/*function generatePoster(texture, width, height)
			{
				var p = template.clone();
				p.material = new THREE.MeshBasicMaterial({map: texture});
				p.material.side = THREE.DoubleSide;
				
				p.scale.set(width, height, 1);

				var ratio = width/height;
				if(ratio > 1){
					texture.repeat.set(1, 1/ratio);
					texture.offset.set(0, 1-1/ratio);
				}
				else {
					texture.repeat.set(1/ratio, 1);
					texture.offset.set(0, 0);
				}

				return p;
			}*/
		});
	}
}