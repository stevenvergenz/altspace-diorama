'use strict';

class Diorama
{
	constructor()
	{
		var self = this;

		self.assetCache = {
			models: {},
			textures: {},
			videos: {}
		};

		self.scene = new THREE.Scene();

		// set up renderer and scale
		if(altspace.inClient)
		{
			self.renderer = altspace.getThreeJSRenderer();
			Promise.all([altspace.getEnclosure(), altspace.getSpace()])
			.then(function([e, s]){
				self.env = Object.freeze({
					innerHeight: e.innerHeight,
					innerWidth: e.innerWidth,
					innerDepth: e.innerDepth,
					pixelsPerMeter: e.pixelsPerMeter,
					sid: s.sid,
					name: s.name,
					templateSid: s.templateSid
				});

				self.scene.scale.multiplyScalar(e.pixelsPerMeter);
			});
		}
		else
		{
			// set up preview renderer, in case we're out of world
			self.renderer = new THREE.WebGLRenderer();
			self.renderer.setSize(window.innerWidth, window.innerHeight);
			self.renderer.setClearColor( 0x888888 );
			document.body.appendChild(self.renderer.domElement);
		
			self.previewCamera = new Diorama.PreviewCamera();
			self.scene.add(self.previewCamera);
			self.previewCamera.registerHooks(self.renderer);

			// set up cursor emulation
			altspace.utilities.shims.cursor.init(self.scene, self.previewCamera, {renderer: self.renderer});
		
			// stub environment
			self.env = Object.freeze({
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
		var self = this;

		// construct dioramas
		modules.forEach(function(module)
		{
			var root = new THREE.Object3D();
			self.scene.add(root);
		
			self.loadAssets(module.assets).then((results) => {
				module.initialize(self.env, root, results);
			});
		});
		
		// start animating
		window.requestAnimationFrame(function animate(timestamp)
		{
			window.requestAnimationFrame(animate);
			self.scene.updateAllBehaviors();
			self.renderer.render(self.scene, self.previewCamera);
		});
	}

	loadAssets(manifest)
	{
		var self = this;

		function PromisesFinished(arr)
		{
			return new Promise((resolve, reject) =>
			{
				var waiting = arr.length;
				
				function checkDone(){
					if( --waiting === 0 )
						resolve();
				}

				arr.forEach(p => { p.then(checkDone, checkDone); });
			});
		}

		return new Promise((resolve, reject) =>
		{
			// populate cache
			PromisesFinished([

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

			.then(() =>
			{
				// populate payload from cache
				var payload = {models: {}, textures: {}};

				for(let i in manifest.models){
					let t = self.assetCache.models[manifest.models[i]];
					payload.models[i] = t ? t.clone() : null;
				}

				for(let i in manifest.textures){
					let t = self.assetCache.textures[manifest.textures[i]];
					payload.textures[i] = t ? t.clone() : null;
				}

				resolve(payload);
			});
		});
	}

};
