'use strict';

window.Diorama = class Diorama
{
	constructor()
	{
		this.assetCache = {
			models: {},
			textures: {},
			videos: {}
		};

		this.scene = new THREE.Scene();
		this.previewCamera = new THREE.OrthographicCamera();
		this.scene.add(this.previewCamera);

		// set up renderer and scale
		if(altspace.inClient)
		{
			this.renderer = altspace.getThreeJSRenderer();
			Promise.all([altspace.getEnclosure(), altspace.getSpace()])
			.then(function([e, s]){
				this.env = Object.freeze({
					innerHeight: e.innerHeight,
					innerWidth: e.innerWidth,
					innerDepth: e.innerDepth,
					pixelsPerMeter: e.pixelsPerMeter,
					sid: s.sid,
					name: s.name,
					templateSid: s.templateSid
				});

				this.scene.scale.multiplyScalar(e.pixelsPerMeter);
			});
		}
		else
		{
			// set up preview renderer, in case we're out of world
			this.renderer = new THREE.WebGLRenderer();
			this.renderer.setSize(720, 720);
			this.renderer.setClearColor( 0x888888 );
			document.body.appendChild(this.renderer.domElement);
		
			// set up cursor emulation
			altspace.utilities.shims.cursor.init(scene, camera, {renderer: renderer});
		
			// stub environment
			this.env = Object.freeze({
				innerWidth: 1024,
				innerHeight: 1024,
				innerDepth: 1024,
				pixelsPerMeter: 1024/3,
				sid: 'browser',
				name: 'browser',
				templateSid: 'browser'
			});
		}
		
		
	start(...modules)
	{
		// construct dioramas
		modules.forEach(function(module)
		{
			var root = new THREE.Object3D();
			this.scene.add(root);
		
			Diorama.loadAssets(module.assets, function(results)
			{
				module.initialize(env, root, results);
			});
		});
		
		// start animating
		window.requestAnimationFrame(function animate(timestamp)
		{
			window.requestAnimationFrame(animate);
			this.scene.updateAllBehaviors();
			this.renderer.render(this.scene, this.camera);
		});
	}

	loadAssets(manifest)
	{
		return new Promise((resolve, reject) =>
		{
			var payload = {};
			var self = this;

			// the promise for all assets
			Promise.all([

				// the promise for all models
				Promise.all(Object.keys(manifest.models || {}).map(id =>
				{
					var url = manifest.models[id];
					if(self.assetCache.models[url])
						return Promise.resolve(self.assetCache.models[url]);
					else
						return Diorama.ModelPromise(url).then(model => {
							self.assetCache.models[url] = model;
						});
				}),

				// the promise for all textures
				Promise.all(Object.keys(manifest.textures || {}).map(id =>
				{
					var url = manifest.textures[id];
					if(self.assetCache.textures[url])
						return Promise.resolve(self.assetCache.textures[url]);
					else
						return Diorama.ModelPromise(url).then(texture => {
							self.assetCache.textures[url] = texture;
						});			
				})
			])

			.then(() => resolve(payload))
			.catch((...args) => reject(...args));
		};
	}

	// loads an asset manifest from a vignette
	loadAssets(manifest)
	{
		return new Promise((resolve,reject) => {

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


}
