'use strict';

(function(exports)
{
	var cache = {
		models: {},
		textures: {},
		videos: {}
	};

	// loads an asset manifest from a vignette
	function loadAssets(manifest, callback)
	{
		var waiting = 0;
		var payload = {};

		// load models
		if(manifest.models)
		{
			payload.models = {};

			// loop over each entry in the model manifest
			Object.keys(manifest.models).forEach(function(id)
			{
				var url = manifest.models[id];

				// check cache for asset
				if(cache.models[url]){
					payload.models[id] = cache.models[url].clone();
				}

				// load gltf models
				else if(/\.gltf$/.test(url))
				{
					// increment wait count
					waiting++;

					// start loader
					var loader = new THREE.glTFLoader();
					loader.load(url, function(result)
					{
						// write model to cache and payload
						cache.models[url] = result.scene.children[0].children[0];
						payload.models[id] = cache.models[url].clone();

						// finish
						checkComplete(true);
					});
				}
			});
		}

		if(manifest.textures)
		{
			payload.textures = {};

			// loop over each entry in the texture manifest
			Object.keys(manifest.textures).forEach(function(id)
			{
				var url = manifest.textures[id];

				// check cache for asset
				if(cache.textures[url]){
					payload.textures[id] = cache.textures[url].clone();
				}

				// load textures
				else
				{
					// increment wait count
					waiting++;
					
					// start loader
					var loader = new THREE.TextureLoader();
					loader.load(url,
						function(texture)
						{
							// write texture to cache and payload
							cache.textures[url] = texture;
							payload.textures[id] = cache.textures[url].clone();

							// finish
							checkComplete(true);
						},
						null,
						function(err)
						{
							console.error(err);
							checkComplete(true);
						}
					);
				}
			});
		}

		if(manifest.videos)
		{
			payload.videos = {};

			// loop over each entry in the texture manifest
			Object.keys(manifest.videos).forEach(function(id)
			{
				var url = manifest.videos[id];

				// check cache for asset
				if(cache.videos[url]){
					payload.videos[id] = cache.videos[url].clone();
				}

				// load videos
				else
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

					cache.videos[url] = tex;
					payload.videos[id] = cache.videos[url];
				}
			});

		}

		checkComplete();


		function checkComplete(done)
		{
			if(done) waiting--;
			if(waiting === 0)
				callback(payload);
		}
	}

	

	exports.loadAssets = loadAssets;

})(window.Diorama = window.Diorama || {});
