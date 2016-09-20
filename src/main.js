'use strict';

class Diorama
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
		var self = this;

		return new Promise((resolve, reject) =>
		{
			// populate cache
			Promise.all([

				// populate model cache
				Promise.all(Object.keys(manifest.models || {}).map(id =>
				{
					var url = manifest.models[id];
					if(self.assetCache.models[url])
						return Promise.resolve(self.assetCache.models[url]);
					else
						return Diorama.ModelPromise(url).then(model => {
							self.assetCache.models[url] = model;
						});
				})),

				// populate explicit texture cache
				Promise.all(Object.keys(manifest.textures || {}).map(id =>
				{
					var url = manifest.textures[id];
					if(self.assetCache.textures[url])
						return Promise.resolve(self.assetCache.textures[url]);
					else
						return Diorama.TexturePromise(url).then(texture => {
							self.assetCache.textures[url] = texture;
						});			
				}))
			])

			.catch((...args) => reject(...args))
			.then(() =>
			{
				// populate payload from cache
				var payload = {models: {}, textures: {}};

				for(let i in manifest.models){
					payload.models[i] = self.assetCache.models[manifest.models[i]];
				}

				for(let i in manifest.textures){
					payload.textures[i] = self.assetCache.textures[manifest.textures[i]];
				}

				resolve(payload);
			});
		});
	}

};
