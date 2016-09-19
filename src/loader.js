'use strict';

{
	window.Diorama.ModelPromise = function(url)
	{
		return new Promise((resolve, reject) =>
		{
			// NOTE: glTF loader does not catch errors
			if(/\.gltf$/.test(url)){
				var loader = new THREE.glTFLoader();
				loader.load(url, (result) => {
					resolve(result.scene.children[0].children[0]);
				});
			}
		});
	}

	window.Diorama.TexturePromise = function(url)
	{
		return new Promise((resolve, reject) =>
		{
			var loader = new THREE.TextureLoader();
			loader.load(url, resolve, null, reject);
		});
	}

	window.Diorama.VideoPromise = function(url)
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
