'use strict';

import * as Loaders from './loaders';
import PreviewCamera from './camera';

export default class Diorama
{
	constructor({bgColor=0xaaaaaa, gridOffset=[0,0,0], fullspace=false} = {})
	{
		var self = this;
		self._cache = Loaders._cache;
		self.scene = new THREE.Scene();

		// set up renderer and scale
		if(altspace.inClient)
		{
			self.renderer = altspace.getThreeJSRenderer();
			self._envPromise = Promise.all([altspace.getEnclosure(), altspace.getSpace()])
			.then(([e, s]) => {

				function adjustScale(){
					self.scene.scale.setScalar(e.pixelsPerMeter);
					self.env = Object.assign({}, e, s);
				}
				adjustScale();

				if(fullspace){
					self._fsPromise = e.requestFullspace().catch((e) => console.warn('Request for fullspace denied'));
					e.addEventListener('fullspacechange', adjustScale);
				}
				else
					self._fsPromise = Promise.resolve();
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
			self.previewCamera.gridHelper.position.fromArray(gridOffset);
			self.scene.add(self.previewCamera, self.previewCamera.gridHelper);
			self.previewCamera.registerHooks(self.renderer);

			// set up cursor emulation
			altspace.utilities.shims.cursor.init(self.scene, self.previewCamera, {renderer: self.renderer});

			// stub environment
			self.env = {
				innerWidth: 1024,
				innerHeight: 1024,
				innerDepth: 1024,
				pixelsPerMeter: fullspace ? 1 : 1024/3,
				sid: 'browser',
				name: 'browser',
				templateSid: 'browser'
			};

			self._envPromise = Promise.resolve();
			self._fsPromise = Promise.resolve();
		}
	}


	start(...modules)
	{
		var self = this;

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
			Object.keys(mod.assets.posters || {}).map(k => mod.assets.posters[k]).forEach(checkAsset);
		});

		// determine if the tracking skeleton is needed
		let needsSkeleton = modules.reduce((ns,m) => ns || m.needsSkeleton, false);
		if(needsSkeleton && altspace.inClient){
			self._skelPromise = altspace.getThreeJSTrackingSkeleton().then(skel => {
				self.scene.add(skel);
				self.env.skel = skel;
				self.env = Object.freeze(self.env);
			});
		}
		else {
			self.env = Object.freeze(self.env);
			self._skelPromise = Promise.resolve();
		}

		Promise.all([self._envPromise, self._fsPromise, self._skelPromise]).then(() =>
		{
			// construct dioramas
			modules.forEach(function(module)
			{
				let root = null;

				if(module instanceof THREE.Object3D){
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
					let axis = new THREE.AxisHelper(1);
					axis.userData.altspace = {collider: {enabled: false}};
					root.add(axis);
				}

				self.loadAssets(module.assets, singletons).then((results) => {
					module.initialize(self.env, root, results);
				});
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

		return new Promise((resolve, reject) =>
		{
			// populate cache
			Promise.all([

				// populate model cache
				...Object.keys(manifest.models || {}).map(id => Loaders.ModelPromise(manifest.models[id])),

				// populate explicit texture cache
				...Object.keys(manifest.textures || {}).map(id => Loaders.TexturePromise(manifest.textures[id])),

				// generate all posters
				...Object.keys(manifest.posters || {}).map(id => Loaders.PosterPromise(manifest.posters[id]))
			])

			.then(() =>
			{
				// populate payload from cache
				var payload = {models: {}, textures: {}, posters: {}};

				for(let i in manifest.models){
					let url = manifest.models[i];
					let t = Loaders._cache.models[url];
					payload.models[i] = t ? singletons[url] ? t : t.clone() : null;
				}

				for(let i in manifest.textures){
					let url = manifest.textures[i];
					let t = Loaders._cache.textures[url];
					payload.textures[i] = t ? singletons[url] ? t : t.clone() : null;
				}

				for(let i in manifest.posters){
					let url = manifest.posters[i];
					let t = Loaders._cache.posters[url];
					payload.posters[i] = t ? singletons[url] ? t : t.clone() : null;
				}

				resolve(payload);
			})
			.catch(e => console.error(e.stack));
		});
	}

};
