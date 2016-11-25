'use strict';

import * as Loaders from './loaders';
import PreviewCamera from './camera';

export default class Diorama
{
	constructor({bgColor=0xaaaaaa, gridOffset=new THREE.Vector3()} = {})
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
			self._envPromise = Promise.all([altspace.getEnclosure(), altspace.getSpace()])
			.then(function([e, s]){
				self.env = Object.freeze(Object.assign({}, e, s));
				self.scene.scale.multiplyScalar(e.pixelsPerMeter);
			});
		}
		else
		{
			// set up preview renderer, in case we're out of world
			self.renderer = new THREE.WebGLRenderer();
			self.renderer.setSize(document.body.clientWidth, document.body.clientHeight);
			self.renderer.setClearColor( bgColor );
			document.body.appendChild(self.renderer.domElement);
		
			self.previewCamera = new PreviewCamera();
			self.previewCamera.gridHelper.position.copy(gridOffset);
			self.scene.add(self.previewCamera, self.previewCamera.gridHelper);
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

		// make sure space info is filled out before initialization
		if(!self.env){
			return self._envPromise.then(() => { self.start(...modules); });
		}

		// determine which assets aren't shared
		var singletons = {};
		modules.forEach(mod =>
		{
			function checkAsset(url){
				if(singletons[url] === undefined) singletons[url] = true;
				else if(singletons[url] === true) singletons[url] = false;
			}
			Object.keys(mod.assets.textures || {}).map(k => mod.assets.textures[k]).forEach(checkAsset);
			Object.keys(mod.assets.models || {}).map(k => mod.assets.models[k]).forEach(checkAsset);
		});

		// determine if the tracking skeleton is needed
		let needsSkeleton = modules.reduce((ns,m) => ns || m.needsSkeleton, false);
		if(needsSkeleton && altspace.inClient){
			altspace.getThreeJSTrackingSkeleton().then(skel => {
				self.scene.add(skel);
				self.env.skel = skel;
			});
		}

		// construct dioramas
		modules.forEach(function(module)
		{
			let root = null;
			
			if(module instanceof THREE.Object3D)
			{
				root = module;
			}
			else
			{
				root = new THREE.Object3D();

				// handle absolute positioning
				if(module.transform){
					root.matrix.fromArray(module.transform);
					root.matrix.decompose(root.position, root.quaternion, root.scale);
				}
				else {
					if(module.position){
						root.position.fromArray(module.position);
					}
					if(module.rotation){
						root.rotation.fromArray(module.rotation);
					}
				}
			}

			// handle relative positioning
			if(module.verticalAlign){
				let halfHeight = self.env.innerHeight/(2*self.env.pixelsPerMeter);
				switch(module.verticalAlign){
				case 'top':
					root.translateY(halfHeight);
					break;
				case 'bottom':
					root.translateY(-halfHeight);
					break;
				case 'middle':
					// default
					break;
				default:
					console.warn('Invalid value for "verticalAlign" - ', module.verticalAlign);
					break;
				}
			}

			self.scene.add(root);

			if(self.previewCamera){
				root.add( new THREE.AxisHelper(1) );
			}
		
			self.loadAssets(module.assets, singletons).then((results) => {
				module.initialize(self.env, root, results);
			});
		});
		
		// start animating
		window.requestAnimationFrame(function animate(timestamp)
		{
			window.requestAnimationFrame(animate);
			self.scene.updateAllBehaviors();
			if(window.TWEEN) TWEEN.update();
			self.renderer.render(self.scene, self.previewCamera);
		});
	}

	loadAssets(manifest, singletons)
	{
		var self = this;

		class PromisesFinished extends Promise {
			constructor(arr){
				super((resolve, reject) =>
				{
					var waiting = arr.length;
				
					function checkDone(){
						if(--waiting === 0)
							resolve();
					}

					arr.forEach(p => { p.then(checkDone, checkDone); });
				});
			}
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
						return Loaders.ModelPromise(url).then(model => {
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
						return Loaders.TexturePromise(url).then(texture => {
							self.assetCache.textures[url] = texture;
						});			
				}))
			])

			.then(() =>
			{
				// populate payload from cache
				var payload = {models: {}, textures: {}};

				for(let i in manifest.models){
					let url = manifest.models[i];
					let t = self.assetCache.models[url];
					payload.models[i] = t ? singletons[url] ? t : t.clone() : null;
				}

				for(let i in manifest.textures){
					let url = manifest.textures[i];
					let t = self.assetCache.textures[url];
					payload.textures[i] = t ? singletons[url] ? t : t.clone() : null;
				}

				resolve(payload);
			});
		});
	}

};
