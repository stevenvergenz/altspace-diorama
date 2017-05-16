var Diorama = (function () {
'use strict';

var originalGetTexture = THREE.TextureLoader.prototype.load;

function getTexture (url, resolve)
{
	if(this.forceLoad) { return originalGetTexture.call(this, url, resolve); }

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
	var noop = function () {};
	THREE.Loader.Handlers.add(/jpe?g|png/i, { load: getTexture, setCrossOrigin: noop });
	THREE.TextureLoader.prototype.load = getTexture;
}

var cache = {models: {}, textures: {}, posters: {}};

function ModelPromise(url)
{
	return new Promise(function (resolve, reject) {
		if(cache.models[url]){
			return resolve(cache.models[url]);
		}

		// NOTE: glTF loader does not catch errors
		else if(/\.gltf$/i.test(url)){
			if(THREE.glTFLoader){
				var loader = new THREE.glTFLoader();
				loader.load(url, function (result) {
					cache.models[url] = result.scene.children[0].children[0];
					return resolve(cache.models[url]);
				});
			}
			else if(THREE.GLTFLoader){
				var loader$1 = new THREE.GLTFLoader();
				loader$1.load(url, function (result) {
					cache.models[url] = result.scene.children[0];
					cache.models[url].matrixAutoUpdate = true;
					/*result.scene.traverse((o) => {
						if(o.material && o.material.map)
							console.log('flipY', o.material.map.flipY);
					});*/


					return resolve(cache.models[url]);
				}, function () {}, reject);
			}
			else {
				console.error(("glTF loader not found. \"" + url + "\" not loaded."));
				reject();
			}
		}

		else if(/\.dae$/i.test(url)){
			if(THREE.ColladaLoader){
				var loader$2 = new THREE.ColladaLoader();
				loader$2.load(url, function (result) {
					cache.models[url] = result.scene.children[0];
					return resolve(result.scene.children[0])
				}, null, reject);
			}
			else {
				console.error(("Collada loader not found. \"" + url + "\" not loaded."));
				reject();
			}
		}
	});
}

function TexturePromise(url, config){
	if ( config === void 0 ) config = {forceLoad: false};

	return new Promise(function (resolve, reject) {
		if(cache.textures[url])
			{ return resolve(cache.textures[url]); }
		else {
			var loader = new THREE.TextureLoader();
			loader.forceLoad = config.forceLoad;
			loader.load(url, function (texture) {
				cache.textures[url] = texture;
				return resolve(texture);
			}, null, reject);
		}
	});
}

function PosterPromise(url){
	return new Promise(function (resolve, reject) {
		if(cache.posters[url])
			{ return resolve(cache.posters[url]); }
		else { return (new TexturePromise(url, {forceLoad: true})).then(function (tex) {
				var ratio = tex.image.width / tex.image.height;
				var geo, mat = new THREE.MeshBasicMaterial({map: tex, side: THREE.DoubleSide});

				if(ratio > 1){
					geo = new THREE.PlaneGeometry(1, 1/ratio);
				}
				else {
					geo = new THREE.PlaneGeometry(ratio, 1);
				}

				cache.posters[url] = new THREE.Mesh(geo, mat);
				return resolve(cache.posters[url]);
			}
		); }
	});
}

var PreviewCamera = (function (superclass) {
	function PreviewCamera(focus, viewSize, lookDirection)
	{
		superclass.call(this, -1, 1, 1, -1, .1, 400);

		var settings = window.localStorage.getItem('dioramaViewSettings');
		if(settings){
			settings = JSON.parse(settings);
			if(!focus)
				{ focus = new THREE.Vector3().fromArray(settings.focus); }
			if(!viewSize)
				{ viewSize = settings.viewSize; }
			if(!lookDirection)
				{ lookDirection = new THREE.Vector3().fromArray(settings.lookDirection); }
		}

		this._viewSize = viewSize || 40;
		this._focus = focus || new THREE.Vector3();
		this._lookDirection = lookDirection || new THREE.Vector3(0,-1,0);
		this.gridHelper = new THREE.GridHelper(300, 1);
		this.gridHelper.userData = {altspace: {collider: {enabled: false}}};
		//this.gridHelper.quaternion.setFromUnitVectors( new THREE.Vector3(0,-1,0), this._lookDirection );
	}

	if ( superclass ) PreviewCamera.__proto__ = superclass;
	PreviewCamera.prototype = Object.create( superclass && superclass.prototype );
	PreviewCamera.prototype.constructor = PreviewCamera;

	var prototypeAccessors = { viewSize: {},focus: {},lookDirection: {} };

	prototypeAccessors.viewSize.get = function (){
		return this._viewSize;
	};
	prototypeAccessors.viewSize.set = function (val){
		this._viewSize = val;
		this.recomputeViewport();
	};

	prototypeAccessors.focus.get = function (){
		return this._focus;
	};
	prototypeAccessors.focus.set = function (val){
		this._focus.copy(val);
		this.recomputeViewport();
	};

	prototypeAccessors.lookDirection.get = function (){
		return this._lookDirection;
	};
	prototypeAccessors.lookDirection.set = function (val){
		this._lookDirection.copy(val);
		this.recomputeViewport();
	};

	PreviewCamera.prototype.registerHooks = function registerHooks (renderer)
	{
		var self = this;
		self.renderer = renderer;

		// set styles on the page, so the preview works right
		document.body.parentElement.style.height = '100%';
		document.body.style.height = '100%';
		document.body.style.margin = '0';
		document.body.style.overflow = 'hidden';

		var info = document.createElement('p');
		info.innerHTML = ['Middle click and drag to pan', 'Mouse wheel to zoom', 'Arrow keys to rotate'].join('<br/>');
		Object.assign(info.style, {
			position: 'fixed',
			top: '10px',
			left: '10px',
			margin: 0
		});
		document.body.appendChild(info);

		// resize the preview canvas when window resizes
		window.addEventListener('resize', function (e) { return self.recomputeViewport(); });
		self.recomputeViewport();

		// middle click and drag to pan view
		var dragStart = null, focusStart = null;
		window.addEventListener('mousedown', function (e) {
			if(e.button === 1){
				dragStart = {x: e.clientX, y: e.clientY};
				focusStart = self._focus.clone();
			}
		});
		window.addEventListener('mouseup', function (e) {
			if(e.button === 1){
				dragStart = null;
				focusStart = null;
			}
		});
		window.addEventListener('mousemove', function (e) {
			if(dragStart)
			{
				var ref = document.body;
				var w = ref.clientWidth;
				var h = ref.clientHeight;
				var pixelsPerMeter = Math.sqrt(w*w+h*h) / self._viewSize;
				var dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
				var right = new THREE.Vector3().crossVectors(self._lookDirection, self.up);

				self._focus.copy(focusStart)
					.add(self.up.clone().multiplyScalar(dy/pixelsPerMeter))
					.add(right.multiplyScalar(-dx/pixelsPerMeter));

				self.recomputeViewport();
			}
		});

		// wheel to zoom
		window.addEventListener('wheel', function (e) {
			if(e.deltaY < 0){
				self._viewSize *= 0.90;
				self.recomputeViewport();
			}
			else if(e.deltaY > 0){
				self._viewSize *= 1.1;
				self.recomputeViewport();
			}
		});

		// arrow keys to rotate
		window.addEventListener('keydown', function (e) {
			if(e.key === 'ArrowDown'){
				var right = new THREE.Vector3().crossVectors(self._lookDirection, self.up);
				self._lookDirection.applyAxisAngle(right, Math.PI/2);
				//self.gridHelper.rotateOnAxis(right, Math.PI/2);
				self.recomputeViewport();
			}
			else if(e.key === 'ArrowUp'){
				var right$1 = new THREE.Vector3().crossVectors(self._lookDirection, self.up);
				self._lookDirection.applyAxisAngle(right$1, -Math.PI/2);
				//self.gridHelper.rotateOnAxis(right, -Math.PI/2);
				self.recomputeViewport();

			}
			else if(e.key === 'ArrowLeft'){
				self._lookDirection.applyAxisAngle(self.up, -Math.PI/2);
				//self.gridHelper.rotateOnAxis(self.up, -Math.PI/2);
				self.recomputeViewport();
			}
			else if(e.key === 'ArrowRight'){
				self._lookDirection.applyAxisAngle(self.up, Math.PI/2);
				//self.gridHelper.rotateOnAxis(self.up, Math.PI/2);
				self.recomputeViewport();
			}
		});
	};

	PreviewCamera.prototype.recomputeViewport = function recomputeViewport ()
	{
		var ref = document.body;
		var w = ref.clientWidth;
		var h = ref.clientHeight;

		// resize canvas
		this.renderer.setSize(w, h);

		// compute window dimensions from view size
		var ratio = w/h;
		var height = Math.sqrt( (this._viewSize*this._viewSize) / (ratio*ratio + 1) );
		var width = ratio * height;

		// set frustrum edges
		this.left = -width/2;
		this.right = width/2;
		this.top = height/2;
		this.bottom = -height/2;

		this.updateProjectionMatrix();

		// update position
		this.position.copy(this._focus).sub( this._lookDirection.clone().multiplyScalar(200) );
		if( Math.abs( this._lookDirection.normalize().dot(new THREE.Vector3(0,-1,0)) ) === 1 )
			{ this.up.set(0,0,1); } // if we're looking down the Y axis
		else
			{ this.up.set(0,1,0); }
		this.lookAt( this._focus );

		window.localStorage.setItem('dioramaViewSettings', JSON.stringify({
			focus: this._focus.toArray(),
			viewSize: this._viewSize,
			lookDirection: this._lookDirection.toArray()
		}));
	};

	Object.defineProperties( PreviewCamera.prototype, prototypeAccessors );

	return PreviewCamera;
}(THREE.OrthographicCamera));

var Diorama = function Diorama(ref)
{
	if ( ref === void 0 ) ref = {};
	var bgColor = ref.bgColor; if ( bgColor === void 0 ) bgColor = 0xaaaaaa;
	var gridOffset = ref.gridOffset; if ( gridOffset === void 0 ) gridOffset = [0,0,0];
	var fullspace = ref.fullspace; if ( fullspace === void 0 ) fullspace = false;

	var self = this;
	self._cache = cache;
	self.scene = new THREE.Scene();

	// set up renderer and scale
	if(altspace.inClient)
	{
		self.renderer = altspace.getThreeJSRenderer();
		self._envPromise = Promise.all([altspace.getEnclosure(), altspace.getSpace()])
		.then(function (ref) {
			var e = ref[0];
			var s = ref[1];


			function adjustScale(){
				self.scene.scale.setScalar(e.pixelsPerMeter);
				self.env = Object.assign({}, e, s);
			}
			adjustScale();

			if(fullspace){
				self._fsPromise = e.requestFullspace().catch(function (e) { return console.warn('Request for fullspace denied'); });
				e.addEventListener('fullspacechange', adjustScale);
			}
			else
				{ self._fsPromise = Promise.resolve(); }
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
};


Diorama.prototype.start = function start ()
{
		var modules = [], len = arguments.length;
		while ( len-- ) modules[ len ] = arguments[ len ];

	var self = this;

	// determine which assets aren't shared
	var singletons = {};
	modules.forEach(function (mod) {
		function checkAsset(url){
			if(singletons[url] === undefined) { singletons[url] = true; }
			else if(singletons[url] === true) { singletons[url] = false; }
		}
		Object.keys(mod.assets.textures || {}).map(function (k) { return mod.assets.textures[k]; }).forEach(checkAsset);
		Object.keys(mod.assets.models || {}).map(function (k) { return mod.assets.models[k]; }).forEach(checkAsset);
		Object.keys(mod.assets.posters || {}).map(function (k) { return mod.assets.posters[k]; }).forEach(checkAsset);
	});

	// determine if the tracking skeleton is needed
	var needsSkeleton = modules.reduce(function (ns,m) { return ns || m.needsSkeleton; }, false);
	if(needsSkeleton && altspace.inClient){
		self._skelPromise = Promise.all([
			altspace.getThreeJSTrackingSkeleton(),
			self._envPromise
		]).then(function (skel) {
			self.scene.add(skel);
			self.env.skel = skel;
			self.env = Object.freeze(self.env);
		});
	}
	else {
		self._envPromise.then(function () {
			self.env = Object.freeze(self.env);
		});
		self._skelPromise = Promise.resolve();
	}

	Promise.all([self._envPromise, self._fsPromise, self._skelPromise]).then(function () {
		// construct dioramas
		modules.forEach(function(module)
		{
			var root = null;

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
				var halfHeight = self.env.innerHeight/(2*self.env.pixelsPerMeter);
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
				var axis = new THREE.AxisHelper(1);
				axis.userData.altspace = {collider: {enabled: false}};
				root.add(axis);
			}

			self.loadAssets(module.assets, singletons).then(function (results) {
				module.initialize(self.env, root, results);
			});
		});
	});

	// start animating
	window.requestAnimationFrame(function animate(timestamp)
	{
		window.requestAnimationFrame(animate);
		self.scene.updateAllBehaviors();
		if(window.TWEEN) { TWEEN.update(); }
		self.renderer.render(self.scene, self.previewCamera);
	});
};

Diorama.prototype.loadAssets = function loadAssets (manifest, singletons)
{
	var self = this;

	return new Promise(function (resolve, reject) {
		// populate cache
		Promise.all(Object.keys(manifest.models || {}).map(function (id) { return ModelPromise(manifest.models[id]); }).concat( Object.keys(manifest.textures || {}).map(function (id) { return TexturePromise(manifest.textures[id]); }),

			// generate all posters
			Object.keys(manifest.posters || {}).map(function (id) { return PosterPromise(manifest.posters[id]); })
		))

		.then(function () {
			// populate payload from cache
			var payload = {models: {}, textures: {}, posters: {}};

			for(var i in manifest.models){
				var url = manifest.models[i];
				var t = cache.models[url];
				payload.models[i] = t ? singletons[url] ? t : t.clone() : null;
			}

			for(var i$1 in manifest.textures){
				var url$1 = manifest.textures[i$1];
				var t$1 = cache.textures[url$1];
				payload.textures[i$1] = t$1 ? singletons[url$1] ? t$1 : t$1.clone() : null;
			}

			for(var i$2 in manifest.posters){
				var url$2 = manifest.posters[i$2];
				var t$2 = cache.posters[url$2];
				payload.posters[i$2] = t$2 ? singletons[url$2] ? t$2 : t$2.clone() : null;
			}

			resolve(payload);
		})
		.catch(function (e) { return console.error(e.stack); });
	});
};

return Diorama;

}());
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjpudWxsLCJzb3VyY2VzIjpbIi4uL3NyYy9sb2FkZXJzLmpzIiwiLi4vc3JjL2NhbWVyYS5qcyIsIi4uL3NyYy9tYWluLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcclxuXHJcbmxldCBvcmlnaW5hbEdldFRleHR1cmUgPSBUSFJFRS5UZXh0dXJlTG9hZGVyLnByb3RvdHlwZS5sb2FkO1xyXG5cclxuZnVuY3Rpb24gZ2V0VGV4dHVyZSAodXJsLCByZXNvbHZlKVxyXG57XHJcblx0aWYodGhpcy5mb3JjZUxvYWQpIHJldHVybiBvcmlnaW5hbEdldFRleHR1cmUuY2FsbCh0aGlzLCB1cmwsIHJlc29sdmUpO1xyXG5cclxuXHQvLyBjb25zdHJ1Y3QgYWJzb2x1dGUgdXJsXHJcblx0aWYgKHVybCAmJiAhdXJsLnN0YXJ0c1dpdGgoJ2h0dHAnKSAmJiAhdXJsLnN0YXJ0c1dpdGgoJy8vJykpIHtcclxuXHRcdGlmICh1cmwuc3RhcnRzV2l0aCgnLycpKSB7XHJcblx0XHRcdHVybCA9IGxvY2F0aW9uLm9yaWdpbiArIHVybDtcclxuXHRcdH1cclxuXHRcdGVsc2Uge1xyXG5cdFx0XHR2YXIgY3VyclBhdGggPSBsb2NhdGlvbi5wYXRobmFtZTtcclxuXHRcdFx0aWYgKCFjdXJyUGF0aC5lbmRzV2l0aCgnLycpKSB7XHJcblx0XHRcdFx0Y3VyclBhdGggPSBsb2NhdGlvbi5wYXRobmFtZS5zcGxpdCgnLycpLnNsaWNlKDAsIC0xKS5qb2luKCcvJykgKyAnLyc7XHJcblx0XHRcdH1cclxuXHRcdFx0dXJsID0gbG9jYXRpb24ub3JpZ2luICsgY3VyclBhdGggKyB1cmw7XHJcblx0XHR9XHJcblx0fVxyXG5cdGNvbnNvbGUuaW5mbygnQWxsb3dpbmcgQWx0c3BhY2UgdG8gbG9hZCAnICsgdXJsKTtcclxuXHR2YXIgaW1hZ2UgPSB7c3JjOiB1cmx9O1xyXG5cdHZhciB0ZXggPSBuZXcgVEhSRUUuVGV4dHVyZShpbWFnZSk7XHJcblx0aWYgKHJlc29sdmUpIHtcclxuXHRcdHJlc29sdmUodGV4KTtcclxuXHR9XHJcblx0cmV0dXJuIHRleDtcclxufVxyXG5cclxuaWYoYWx0c3BhY2UuaW5DbGllbnQpXHJcbntcclxuXHRsZXQgbm9vcCA9ICgpID0+IHt9O1xyXG5cdFRIUkVFLkxvYWRlci5IYW5kbGVycy5hZGQoL2pwZT9nfHBuZy9pLCB7IGxvYWQ6IGdldFRleHR1cmUsIHNldENyb3NzT3JpZ2luOiBub29wIH0pO1xyXG5cdFRIUkVFLlRleHR1cmVMb2FkZXIucHJvdG90eXBlLmxvYWQgPSBnZXRUZXh0dXJlO1xyXG59XHJcblxyXG5sZXQgY2FjaGUgPSB7bW9kZWxzOiB7fSwgdGV4dHVyZXM6IHt9LCBwb3N0ZXJzOiB7fX07XHJcblxyXG5mdW5jdGlvbiBNb2RlbFByb21pc2UodXJsKVxyXG57XHJcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XHJcblx0e1xyXG5cdFx0aWYoY2FjaGUubW9kZWxzW3VybF0pe1xyXG5cdFx0XHRyZXR1cm4gcmVzb2x2ZShjYWNoZS5tb2RlbHNbdXJsXSk7XHJcblx0XHR9XHJcblxyXG5cdFx0Ly8gTk9URTogZ2xURiBsb2FkZXIgZG9lcyBub3QgY2F0Y2ggZXJyb3JzXHJcblx0XHRlbHNlIGlmKC9cXC5nbHRmJC9pLnRlc3QodXJsKSl7XHJcblx0XHRcdGlmKFRIUkVFLmdsVEZMb2FkZXIpe1xyXG5cdFx0XHRcdGxldCBsb2FkZXIgPSBuZXcgVEhSRUUuZ2xURkxvYWRlcigpO1xyXG5cdFx0XHRcdGxvYWRlci5sb2FkKHVybCwgKHJlc3VsdCkgPT4ge1xyXG5cdFx0XHRcdFx0Y2FjaGUubW9kZWxzW3VybF0gPSByZXN1bHQuc2NlbmUuY2hpbGRyZW5bMF0uY2hpbGRyZW5bMF07XHJcblx0XHRcdFx0XHRyZXR1cm4gcmVzb2x2ZShjYWNoZS5tb2RlbHNbdXJsXSk7XHJcblx0XHRcdFx0fSk7XHJcblx0XHRcdH1cclxuXHRcdFx0ZWxzZSBpZihUSFJFRS5HTFRGTG9hZGVyKXtcclxuXHRcdFx0XHRsZXQgbG9hZGVyID0gbmV3IFRIUkVFLkdMVEZMb2FkZXIoKTtcclxuXHRcdFx0XHRsb2FkZXIubG9hZCh1cmwsIHJlc3VsdCA9PiB7XHJcblx0XHRcdFx0XHRjYWNoZS5tb2RlbHNbdXJsXSA9IHJlc3VsdC5zY2VuZS5jaGlsZHJlblswXTtcclxuXHRcdFx0XHRcdGNhY2hlLm1vZGVsc1t1cmxdLm1hdHJpeEF1dG9VcGRhdGUgPSB0cnVlO1xyXG5cdFx0XHRcdFx0LypyZXN1bHQuc2NlbmUudHJhdmVyc2UoKG8pID0+IHtcclxuXHRcdFx0XHRcdFx0aWYoby5tYXRlcmlhbCAmJiBvLm1hdGVyaWFsLm1hcClcclxuXHRcdFx0XHRcdFx0XHRjb25zb2xlLmxvZygnZmxpcFknLCBvLm1hdGVyaWFsLm1hcC5mbGlwWSk7XHJcblx0XHRcdFx0XHR9KTsqL1xyXG5cclxuXHJcblx0XHRcdFx0XHRyZXR1cm4gcmVzb2x2ZShjYWNoZS5tb2RlbHNbdXJsXSk7XHJcblx0XHRcdFx0fSwgKCkgPT4ge30sIHJlamVjdCk7XHJcblx0XHRcdH1cclxuXHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0Y29uc29sZS5lcnJvcihgZ2xURiBsb2FkZXIgbm90IGZvdW5kLiBcIiR7dXJsfVwiIG5vdCBsb2FkZWQuYCk7XHJcblx0XHRcdFx0cmVqZWN0KCk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHRlbHNlIGlmKC9cXC5kYWUkL2kudGVzdCh1cmwpKXtcclxuXHRcdFx0aWYoVEhSRUUuQ29sbGFkYUxvYWRlcil7XHJcblx0XHRcdFx0bGV0IGxvYWRlciA9IG5ldyBUSFJFRS5Db2xsYWRhTG9hZGVyKCk7XHJcblx0XHRcdFx0bG9hZGVyLmxvYWQodXJsLCByZXN1bHQgPT4ge1xyXG5cdFx0XHRcdFx0Y2FjaGUubW9kZWxzW3VybF0gPSByZXN1bHQuc2NlbmUuY2hpbGRyZW5bMF07XHJcblx0XHRcdFx0XHRyZXR1cm4gcmVzb2x2ZShyZXN1bHQuc2NlbmUuY2hpbGRyZW5bMF0pXHJcblx0XHRcdFx0fSwgbnVsbCwgcmVqZWN0KTtcclxuXHRcdFx0fVxyXG5cdFx0XHRlbHNlIHtcclxuXHRcdFx0XHRjb25zb2xlLmVycm9yKGBDb2xsYWRhIGxvYWRlciBub3QgZm91bmQuIFwiJHt1cmx9XCIgbm90IGxvYWRlZC5gKTtcclxuXHRcdFx0XHRyZWplY3QoKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBUZXh0dXJlUHJvbWlzZSh1cmwsIGNvbmZpZyA9IHtmb3JjZUxvYWQ6IGZhbHNlfSl7XHJcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XHJcblx0e1xyXG5cdFx0aWYoY2FjaGUudGV4dHVyZXNbdXJsXSlcclxuXHRcdFx0cmV0dXJuIHJlc29sdmUoY2FjaGUudGV4dHVyZXNbdXJsXSk7XHJcblx0XHRlbHNlIHtcclxuXHRcdFx0bGV0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKCk7XHJcblx0XHRcdGxvYWRlci5mb3JjZUxvYWQgPSBjb25maWcuZm9yY2VMb2FkO1xyXG5cdFx0XHRsb2FkZXIubG9hZCh1cmwsIHRleHR1cmUgPT4ge1xyXG5cdFx0XHRcdGNhY2hlLnRleHR1cmVzW3VybF0gPSB0ZXh0dXJlO1xyXG5cdFx0XHRcdHJldHVybiByZXNvbHZlKHRleHR1cmUpO1xyXG5cdFx0XHR9LCBudWxsLCByZWplY3QpO1xyXG5cdFx0fVxyXG5cdH0pO1xyXG59XHJcblxyXG5jbGFzcyBWaWRlb1Byb21pc2UgZXh0ZW5kcyBQcm9taXNlIHtcclxuXHRjb25zdHJ1Y3Rvcih1cmwpXHJcblx0e1xyXG5cdFx0Ly8gc3RhcnQgbG9hZGVyXHJcblx0XHR2YXIgdmlkU3JjID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndmlkZW8nKTtcclxuXHRcdHZpZFNyYy5hdXRvcGxheSA9IHRydWU7XHJcblx0XHR2aWRTcmMubG9vcCA9IHRydWU7XHJcblx0XHR2aWRTcmMuc3JjID0gdXJsO1xyXG5cdFx0dmlkU3JjLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XHJcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHZpZFNyYyk7XHJcblxyXG5cdFx0dmFyIHRleCA9IG5ldyBUSFJFRS5WaWRlb1RleHR1cmUodmlkU3JjKTtcclxuXHRcdHRleC5taW5GaWx0ZXIgPSBUSFJFRS5MaW5lYXJGaWx0ZXI7XHJcblx0XHR0ZXgubWFnRmlsdGVyID0gVEhSRUUuTGluZWFyRmlsdGVyO1xyXG5cdFx0dGV4LmZvcm1hdCA9IFRIUkVFLlJHQkZvcm1hdDtcclxuXHJcblx0XHQvL2NhY2hlLnZpZGVvc1t1cmxdID0gdGV4O1xyXG5cdFx0Ly9wYXlsb2FkLnZpZGVvc1tpZF0gPSBjYWNoZS52aWRlb3NbdXJsXTtcclxuXHJcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRleCk7XHJcblx0fVxyXG59XHJcblxyXG5mdW5jdGlvbiBQb3N0ZXJQcm9taXNlKHVybCl7XHJcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XHJcblx0e1xyXG5cdFx0aWYoY2FjaGUucG9zdGVyc1t1cmxdKVxyXG5cdFx0XHRyZXR1cm4gcmVzb2x2ZShjYWNoZS5wb3N0ZXJzW3VybF0pO1xyXG5cdFx0ZWxzZSByZXR1cm4gKG5ldyBUZXh0dXJlUHJvbWlzZSh1cmwsIHtmb3JjZUxvYWQ6IHRydWV9KSkudGhlbih0ZXggPT5cclxuXHRcdFx0e1xyXG5cdFx0XHRcdGxldCByYXRpbyA9IHRleC5pbWFnZS53aWR0aCAvIHRleC5pbWFnZS5oZWlnaHQ7XHJcblx0XHRcdFx0bGV0IGdlbywgbWF0ID0gbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHttYXA6IHRleCwgc2lkZTogVEhSRUUuRG91YmxlU2lkZX0pO1xyXG5cclxuXHRcdFx0XHRpZihyYXRpbyA+IDEpe1xyXG5cdFx0XHRcdFx0Z2VvID0gbmV3IFRIUkVFLlBsYW5lR2VvbWV0cnkoMSwgMS9yYXRpbyk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdFx0Z2VvID0gbmV3IFRIUkVFLlBsYW5lR2VvbWV0cnkocmF0aW8sIDEpO1xyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0Y2FjaGUucG9zdGVyc1t1cmxdID0gbmV3IFRIUkVFLk1lc2goZ2VvLCBtYXQpO1xyXG5cdFx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLnBvc3RlcnNbdXJsXSk7XHJcblx0XHRcdH1cclxuXHRcdCk7XHJcblx0fSk7XHJcbn1cclxuXHJcbmV4cG9ydCB7IE1vZGVsUHJvbWlzZSwgVGV4dHVyZVByb21pc2UsIFZpZGVvUHJvbWlzZSwgUG9zdGVyUHJvbWlzZSwgY2FjaGUgYXMgX2NhY2hlIH07XHJcbiIsIid1c2Ugc3RyaWN0JztcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFByZXZpZXdDYW1lcmEgZXh0ZW5kcyBUSFJFRS5PcnRob2dyYXBoaWNDYW1lcmFcclxue1xyXG5cdGNvbnN0cnVjdG9yKGZvY3VzLCB2aWV3U2l6ZSwgbG9va0RpcmVjdGlvbilcclxuXHR7XHJcblx0XHRzdXBlcigtMSwgMSwgMSwgLTEsIC4xLCA0MDApO1xyXG5cclxuXHRcdGxldCBzZXR0aW5ncyA9IHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnZGlvcmFtYVZpZXdTZXR0aW5ncycpO1xyXG5cdFx0aWYoc2V0dGluZ3Mpe1xyXG5cdFx0XHRzZXR0aW5ncyA9IEpTT04ucGFyc2Uoc2V0dGluZ3MpO1xyXG5cdFx0XHRpZighZm9jdXMpXHJcblx0XHRcdFx0Zm9jdXMgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmZyb21BcnJheShzZXR0aW5ncy5mb2N1cyk7XHJcblx0XHRcdGlmKCF2aWV3U2l6ZSlcclxuXHRcdFx0XHR2aWV3U2l6ZSA9IHNldHRpbmdzLnZpZXdTaXplO1xyXG5cdFx0XHRpZighbG9va0RpcmVjdGlvbilcclxuXHRcdFx0XHRsb29rRGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5mcm9tQXJyYXkoc2V0dGluZ3MubG9va0RpcmVjdGlvbik7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fdmlld1NpemUgPSB2aWV3U2l6ZSB8fCA0MDtcclxuXHRcdHRoaXMuX2ZvY3VzID0gZm9jdXMgfHwgbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuXHRcdHRoaXMuX2xvb2tEaXJlY3Rpb24gPSBsb29rRGlyZWN0aW9uIHx8IG5ldyBUSFJFRS5WZWN0b3IzKDAsLTEsMCk7XHJcblx0XHR0aGlzLmdyaWRIZWxwZXIgPSBuZXcgVEhSRUUuR3JpZEhlbHBlcigzMDAsIDEpO1xyXG5cdFx0dGhpcy5ncmlkSGVscGVyLnVzZXJEYXRhID0ge2FsdHNwYWNlOiB7Y29sbGlkZXI6IHtlbmFibGVkOiBmYWxzZX19fTtcclxuXHRcdC8vdGhpcy5ncmlkSGVscGVyLnF1YXRlcm5pb24uc2V0RnJvbVVuaXRWZWN0b3JzKCBuZXcgVEhSRUUuVmVjdG9yMygwLC0xLDApLCB0aGlzLl9sb29rRGlyZWN0aW9uICk7XHJcblx0fVxyXG5cclxuXHRnZXQgdmlld1NpemUoKXtcclxuXHRcdHJldHVybiB0aGlzLl92aWV3U2l6ZTtcclxuXHR9XHJcblx0c2V0IHZpZXdTaXplKHZhbCl7XHJcblx0XHR0aGlzLl92aWV3U2l6ZSA9IHZhbDtcclxuXHRcdHRoaXMucmVjb21wdXRlVmlld3BvcnQoKTtcclxuXHR9XHJcblxyXG5cdGdldCBmb2N1cygpe1xyXG5cdFx0cmV0dXJuIHRoaXMuX2ZvY3VzO1xyXG5cdH1cclxuXHRzZXQgZm9jdXModmFsKXtcclxuXHRcdHRoaXMuX2ZvY3VzLmNvcHkodmFsKTtcclxuXHRcdHRoaXMucmVjb21wdXRlVmlld3BvcnQoKTtcclxuXHR9XHJcblxyXG5cdGdldCBsb29rRGlyZWN0aW9uKCl7XHJcblx0XHRyZXR1cm4gdGhpcy5fbG9va0RpcmVjdGlvbjtcclxuXHR9XHJcblx0c2V0IGxvb2tEaXJlY3Rpb24odmFsKXtcclxuXHRcdHRoaXMuX2xvb2tEaXJlY3Rpb24uY29weSh2YWwpO1xyXG5cdFx0dGhpcy5yZWNvbXB1dGVWaWV3cG9ydCgpO1xyXG5cdH1cclxuXHJcblx0cmVnaXN0ZXJIb29rcyhyZW5kZXJlcilcclxuXHR7XHJcblx0XHR2YXIgc2VsZiA9IHRoaXM7XHJcblx0XHRzZWxmLnJlbmRlcmVyID0gcmVuZGVyZXI7XHJcblxyXG5cdFx0Ly8gc2V0IHN0eWxlcyBvbiB0aGUgcGFnZSwgc28gdGhlIHByZXZpZXcgd29ya3MgcmlnaHRcclxuXHRcdGRvY3VtZW50LmJvZHkucGFyZW50RWxlbWVudC5zdHlsZS5oZWlnaHQgPSAnMTAwJSc7XHJcblx0XHRkb2N1bWVudC5ib2R5LnN0eWxlLmhlaWdodCA9ICcxMDAlJztcclxuXHRcdGRvY3VtZW50LmJvZHkuc3R5bGUubWFyZ2luID0gJzAnO1xyXG5cdFx0ZG9jdW1lbnQuYm9keS5zdHlsZS5vdmVyZmxvdyA9ICdoaWRkZW4nO1xyXG5cclxuXHRcdHZhciBpbmZvID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpO1xyXG5cdFx0aW5mby5pbm5lckhUTUwgPSBbJ01pZGRsZSBjbGljayBhbmQgZHJhZyB0byBwYW4nLCAnTW91c2Ugd2hlZWwgdG8gem9vbScsICdBcnJvdyBrZXlzIHRvIHJvdGF0ZSddLmpvaW4oJzxici8+Jyk7XHJcblx0XHRPYmplY3QuYXNzaWduKGluZm8uc3R5bGUsIHtcclxuXHRcdFx0cG9zaXRpb246ICdmaXhlZCcsXHJcblx0XHRcdHRvcDogJzEwcHgnLFxyXG5cdFx0XHRsZWZ0OiAnMTBweCcsXHJcblx0XHRcdG1hcmdpbjogMFxyXG5cdFx0fSk7XHJcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGluZm8pO1xyXG5cclxuXHRcdC8vIHJlc2l6ZSB0aGUgcHJldmlldyBjYW52YXMgd2hlbiB3aW5kb3cgcmVzaXplc1xyXG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIGUgPT4gc2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpKTtcclxuXHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcclxuXHJcblx0XHQvLyBtaWRkbGUgY2xpY2sgYW5kIGRyYWcgdG8gcGFuIHZpZXdcclxuXHRcdHZhciBkcmFnU3RhcnQgPSBudWxsLCBmb2N1c1N0YXJ0ID0gbnVsbDtcclxuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBlID0+IHtcclxuXHRcdFx0aWYoZS5idXR0b24gPT09IDEpe1xyXG5cdFx0XHRcdGRyYWdTdGFydCA9IHt4OiBlLmNsaWVudFgsIHk6IGUuY2xpZW50WX07XHJcblx0XHRcdFx0Zm9jdXNTdGFydCA9IHNlbGYuX2ZvY3VzLmNsb25lKCk7XHJcblx0XHRcdH1cclxuXHRcdH0pO1xyXG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCBlID0+IHtcclxuXHRcdFx0aWYoZS5idXR0b24gPT09IDEpe1xyXG5cdFx0XHRcdGRyYWdTdGFydCA9IG51bGw7XHJcblx0XHRcdFx0Zm9jdXNTdGFydCA9IG51bGw7XHJcblx0XHRcdH1cclxuXHRcdH0pO1xyXG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIGUgPT4ge1xyXG5cdFx0XHRpZihkcmFnU3RhcnQpXHJcblx0XHRcdHtcclxuXHRcdFx0XHRsZXQge2NsaWVudFdpZHRoOiB3LCBjbGllbnRIZWlnaHQ6IGh9ID0gZG9jdW1lbnQuYm9keTtcclxuXHRcdFx0XHRsZXQgcGl4ZWxzUGVyTWV0ZXIgPSBNYXRoLnNxcnQodyp3K2gqaCkgLyBzZWxmLl92aWV3U2l6ZTtcclxuXHRcdFx0XHRsZXQgZHggPSBlLmNsaWVudFggLSBkcmFnU3RhcnQueCwgZHkgPSBlLmNsaWVudFkgLSBkcmFnU3RhcnQueTtcclxuXHRcdFx0XHRsZXQgcmlnaHQgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmNyb3NzVmVjdG9ycyhzZWxmLl9sb29rRGlyZWN0aW9uLCBzZWxmLnVwKTtcclxuXHJcblx0XHRcdFx0c2VsZi5fZm9jdXMuY29weShmb2N1c1N0YXJ0KVxyXG5cdFx0XHRcdFx0LmFkZChzZWxmLnVwLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoZHkvcGl4ZWxzUGVyTWV0ZXIpKVxyXG5cdFx0XHRcdFx0LmFkZChyaWdodC5tdWx0aXBseVNjYWxhcigtZHgvcGl4ZWxzUGVyTWV0ZXIpKTtcclxuXHJcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xyXG5cdFx0XHR9XHJcblx0XHR9KTtcclxuXHJcblx0XHQvLyB3aGVlbCB0byB6b29tXHJcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignd2hlZWwnLCBlID0+IHtcclxuXHRcdFx0aWYoZS5kZWx0YVkgPCAwKXtcclxuXHRcdFx0XHRzZWxmLl92aWV3U2l6ZSAqPSAwLjkwO1xyXG5cdFx0XHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRlbHNlIGlmKGUuZGVsdGFZID4gMCl7XHJcblx0XHRcdFx0c2VsZi5fdmlld1NpemUgKj0gMS4xO1xyXG5cdFx0XHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblxyXG5cdFx0Ly8gYXJyb3cga2V5cyB0byByb3RhdGVcclxuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgZSA9PiB7XHJcblx0XHRcdGlmKGUua2V5ID09PSAnQXJyb3dEb3duJyl7XHJcblx0XHRcdFx0bGV0IHJpZ2h0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5jcm9zc1ZlY3RvcnMoc2VsZi5fbG9va0RpcmVjdGlvbiwgc2VsZi51cCk7XHJcblx0XHRcdFx0c2VsZi5fbG9va0RpcmVjdGlvbi5hcHBseUF4aXNBbmdsZShyaWdodCwgTWF0aC5QSS8yKTtcclxuXHRcdFx0XHQvL3NlbGYuZ3JpZEhlbHBlci5yb3RhdGVPbkF4aXMocmlnaHQsIE1hdGguUEkvMik7XHJcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2UgaWYoZS5rZXkgPT09ICdBcnJvd1VwJyl7XHJcblx0XHRcdFx0bGV0IHJpZ2h0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5jcm9zc1ZlY3RvcnMoc2VsZi5fbG9va0RpcmVjdGlvbiwgc2VsZi51cCk7XHJcblx0XHRcdFx0c2VsZi5fbG9va0RpcmVjdGlvbi5hcHBseUF4aXNBbmdsZShyaWdodCwgLU1hdGguUEkvMik7XHJcblx0XHRcdFx0Ly9zZWxmLmdyaWRIZWxwZXIucm90YXRlT25BeGlzKHJpZ2h0LCAtTWF0aC5QSS8yKTtcclxuXHRcdFx0XHRzZWxmLnJlY29tcHV0ZVZpZXdwb3J0KCk7XHJcblxyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2UgaWYoZS5rZXkgPT09ICdBcnJvd0xlZnQnKXtcclxuXHRcdFx0XHRzZWxmLl9sb29rRGlyZWN0aW9uLmFwcGx5QXhpc0FuZ2xlKHNlbGYudXAsIC1NYXRoLlBJLzIpO1xyXG5cdFx0XHRcdC8vc2VsZi5ncmlkSGVscGVyLnJvdGF0ZU9uQXhpcyhzZWxmLnVwLCAtTWF0aC5QSS8yKTtcclxuXHRcdFx0XHRzZWxmLnJlY29tcHV0ZVZpZXdwb3J0KCk7XHJcblx0XHRcdH1cclxuXHRcdFx0ZWxzZSBpZihlLmtleSA9PT0gJ0Fycm93UmlnaHQnKXtcclxuXHRcdFx0XHRzZWxmLl9sb29rRGlyZWN0aW9uLmFwcGx5QXhpc0FuZ2xlKHNlbGYudXAsIE1hdGguUEkvMik7XHJcblx0XHRcdFx0Ly9zZWxmLmdyaWRIZWxwZXIucm90YXRlT25BeGlzKHNlbGYudXAsIE1hdGguUEkvMik7XHJcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xyXG5cdFx0XHR9XHJcblx0XHR9KTtcclxuXHR9XHJcblxyXG5cdHJlY29tcHV0ZVZpZXdwb3J0KClcclxuXHR7XHJcblx0XHR2YXIge2NsaWVudFdpZHRoOiB3LCBjbGllbnRIZWlnaHQ6IGh9ID0gZG9jdW1lbnQuYm9keTtcclxuXHJcblx0XHQvLyByZXNpemUgY2FudmFzXHJcblx0XHR0aGlzLnJlbmRlcmVyLnNldFNpemUodywgaCk7XHJcblxyXG5cdFx0Ly8gY29tcHV0ZSB3aW5kb3cgZGltZW5zaW9ucyBmcm9tIHZpZXcgc2l6ZVxyXG5cdFx0dmFyIHJhdGlvID0gdy9oO1xyXG5cdFx0dmFyIGhlaWdodCA9IE1hdGguc3FydCggKHRoaXMuX3ZpZXdTaXplKnRoaXMuX3ZpZXdTaXplKSAvIChyYXRpbypyYXRpbyArIDEpICk7XHJcblx0XHR2YXIgd2lkdGggPSByYXRpbyAqIGhlaWdodDtcclxuXHJcblx0XHQvLyBzZXQgZnJ1c3RydW0gZWRnZXNcclxuXHRcdHRoaXMubGVmdCA9IC13aWR0aC8yO1xyXG5cdFx0dGhpcy5yaWdodCA9IHdpZHRoLzI7XHJcblx0XHR0aGlzLnRvcCA9IGhlaWdodC8yO1xyXG5cdFx0dGhpcy5ib3R0b20gPSAtaGVpZ2h0LzI7XHJcblxyXG5cdFx0dGhpcy51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XHJcblxyXG5cdFx0Ly8gdXBkYXRlIHBvc2l0aW9uXHJcblx0XHR0aGlzLnBvc2l0aW9uLmNvcHkodGhpcy5fZm9jdXMpLnN1YiggdGhpcy5fbG9va0RpcmVjdGlvbi5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKDIwMCkgKTtcclxuXHRcdGlmKCBNYXRoLmFicyggdGhpcy5fbG9va0RpcmVjdGlvbi5ub3JtYWxpemUoKS5kb3QobmV3IFRIUkVFLlZlY3RvcjMoMCwtMSwwKSkgKSA9PT0gMSApXHJcblx0XHRcdHRoaXMudXAuc2V0KDAsMCwxKTsgLy8gaWYgd2UncmUgbG9va2luZyBkb3duIHRoZSBZIGF4aXNcclxuXHRcdGVsc2VcclxuXHRcdFx0dGhpcy51cC5zZXQoMCwxLDApO1xyXG5cdFx0dGhpcy5sb29rQXQoIHRoaXMuX2ZvY3VzICk7XHJcblxyXG5cdFx0d2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKCdkaW9yYW1hVmlld1NldHRpbmdzJywgSlNPTi5zdHJpbmdpZnkoe1xyXG5cdFx0XHRmb2N1czogdGhpcy5fZm9jdXMudG9BcnJheSgpLFxyXG5cdFx0XHR2aWV3U2l6ZTogdGhpcy5fdmlld1NpemUsXHJcblx0XHRcdGxvb2tEaXJlY3Rpb246IHRoaXMuX2xvb2tEaXJlY3Rpb24udG9BcnJheSgpXHJcblx0XHR9KSk7XHJcblx0fVxyXG59XHJcbiIsIid1c2Ugc3RyaWN0JztcclxuXHJcbmltcG9ydCAqIGFzIExvYWRlcnMgZnJvbSAnLi9sb2FkZXJzJztcclxuaW1wb3J0IFByZXZpZXdDYW1lcmEgZnJvbSAnLi9jYW1lcmEnO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRGlvcmFtYVxyXG57XHJcblx0Y29uc3RydWN0b3Ioe2JnQ29sb3I9MHhhYWFhYWEsIGdyaWRPZmZzZXQ9WzAsMCwwXSwgZnVsbHNwYWNlPWZhbHNlfSA9IHt9KVxyXG5cdHtcclxuXHRcdHZhciBzZWxmID0gdGhpcztcclxuXHRcdHNlbGYuX2NhY2hlID0gTG9hZGVycy5fY2FjaGU7XHJcblx0XHRzZWxmLnNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XHJcblxyXG5cdFx0Ly8gc2V0IHVwIHJlbmRlcmVyIGFuZCBzY2FsZVxyXG5cdFx0aWYoYWx0c3BhY2UuaW5DbGllbnQpXHJcblx0XHR7XHJcblx0XHRcdHNlbGYucmVuZGVyZXIgPSBhbHRzcGFjZS5nZXRUaHJlZUpTUmVuZGVyZXIoKTtcclxuXHRcdFx0c2VsZi5fZW52UHJvbWlzZSA9IFByb21pc2UuYWxsKFthbHRzcGFjZS5nZXRFbmNsb3N1cmUoKSwgYWx0c3BhY2UuZ2V0U3BhY2UoKV0pXHJcblx0XHRcdC50aGVuKChbZSwgc10pID0+IHtcclxuXHJcblx0XHRcdFx0ZnVuY3Rpb24gYWRqdXN0U2NhbGUoKXtcclxuXHRcdFx0XHRcdHNlbGYuc2NlbmUuc2NhbGUuc2V0U2NhbGFyKGUucGl4ZWxzUGVyTWV0ZXIpO1xyXG5cdFx0XHRcdFx0c2VsZi5lbnYgPSBPYmplY3QuYXNzaWduKHt9LCBlLCBzKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0YWRqdXN0U2NhbGUoKTtcclxuXHJcblx0XHRcdFx0aWYoZnVsbHNwYWNlKXtcclxuXHRcdFx0XHRcdHNlbGYuX2ZzUHJvbWlzZSA9IGUucmVxdWVzdEZ1bGxzcGFjZSgpLmNhdGNoKChlKSA9PiBjb25zb2xlLndhcm4oJ1JlcXVlc3QgZm9yIGZ1bGxzcGFjZSBkZW5pZWQnKSk7XHJcblx0XHRcdFx0XHRlLmFkZEV2ZW50TGlzdGVuZXIoJ2Z1bGxzcGFjZWNoYW5nZScsIGFkanVzdFNjYWxlKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0ZWxzZVxyXG5cdFx0XHRcdFx0c2VsZi5fZnNQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XHJcblx0XHRcdH0pO1xyXG5cdFx0fVxyXG5cdFx0ZWxzZVxyXG5cdFx0e1xyXG5cdFx0XHQvLyBzZXQgdXAgcHJldmlldyByZW5kZXJlciwgaW4gY2FzZSB3ZSdyZSBvdXQgb2Ygd29ybGRcclxuXHRcdFx0c2VsZi5yZW5kZXJlciA9IG5ldyBUSFJFRS5XZWJHTFJlbmRlcmVyKCk7XHJcblx0XHRcdHNlbGYucmVuZGVyZXIuc2V0U2l6ZShkb2N1bWVudC5ib2R5LmNsaWVudFdpZHRoLCBkb2N1bWVudC5ib2R5LmNsaWVudEhlaWdodCk7XHJcblx0XHRcdHNlbGYucmVuZGVyZXIuc2V0Q2xlYXJDb2xvciggYmdDb2xvciApO1xyXG5cdFx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHNlbGYucmVuZGVyZXIuZG9tRWxlbWVudCk7XHJcblxyXG5cdFx0XHRzZWxmLnByZXZpZXdDYW1lcmEgPSBuZXcgUHJldmlld0NhbWVyYSgpO1xyXG5cdFx0XHRzZWxmLnByZXZpZXdDYW1lcmEuZ3JpZEhlbHBlci5wb3NpdGlvbi5mcm9tQXJyYXkoZ3JpZE9mZnNldCk7XHJcblx0XHRcdHNlbGYuc2NlbmUuYWRkKHNlbGYucHJldmlld0NhbWVyYSwgc2VsZi5wcmV2aWV3Q2FtZXJhLmdyaWRIZWxwZXIpO1xyXG5cdFx0XHRzZWxmLnByZXZpZXdDYW1lcmEucmVnaXN0ZXJIb29rcyhzZWxmLnJlbmRlcmVyKTtcclxuXHJcblx0XHRcdC8vIHNldCB1cCBjdXJzb3IgZW11bGF0aW9uXHJcblx0XHRcdGFsdHNwYWNlLnV0aWxpdGllcy5zaGltcy5jdXJzb3IuaW5pdChzZWxmLnNjZW5lLCBzZWxmLnByZXZpZXdDYW1lcmEsIHtyZW5kZXJlcjogc2VsZi5yZW5kZXJlcn0pO1xyXG5cclxuXHRcdFx0Ly8gc3R1YiBlbnZpcm9ubWVudFxyXG5cdFx0XHRzZWxmLmVudiA9IHtcclxuXHRcdFx0XHRpbm5lcldpZHRoOiAxMDI0LFxyXG5cdFx0XHRcdGlubmVySGVpZ2h0OiAxMDI0LFxyXG5cdFx0XHRcdGlubmVyRGVwdGg6IDEwMjQsXHJcblx0XHRcdFx0cGl4ZWxzUGVyTWV0ZXI6IGZ1bGxzcGFjZSA/IDEgOiAxMDI0LzMsXHJcblx0XHRcdFx0c2lkOiAnYnJvd3NlcicsXHJcblx0XHRcdFx0bmFtZTogJ2Jyb3dzZXInLFxyXG5cdFx0XHRcdHRlbXBsYXRlU2lkOiAnYnJvd3NlcidcclxuXHRcdFx0fTtcclxuXHJcblx0XHRcdHNlbGYuX2VudlByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcclxuXHRcdFx0c2VsZi5fZnNQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHJcblx0c3RhcnQoLi4ubW9kdWxlcylcclxuXHR7XHJcblx0XHR2YXIgc2VsZiA9IHRoaXM7XHJcblxyXG5cdFx0Ly8gZGV0ZXJtaW5lIHdoaWNoIGFzc2V0cyBhcmVuJ3Qgc2hhcmVkXHJcblx0XHR2YXIgc2luZ2xldG9ucyA9IHt9O1xyXG5cdFx0bW9kdWxlcy5mb3JFYWNoKG1vZCA9PlxyXG5cdFx0e1xyXG5cdFx0XHRmdW5jdGlvbiBjaGVja0Fzc2V0KHVybCl7XHJcblx0XHRcdFx0aWYoc2luZ2xldG9uc1t1cmxdID09PSB1bmRlZmluZWQpIHNpbmdsZXRvbnNbdXJsXSA9IHRydWU7XHJcblx0XHRcdFx0ZWxzZSBpZihzaW5nbGV0b25zW3VybF0gPT09IHRydWUpIHNpbmdsZXRvbnNbdXJsXSA9IGZhbHNlO1xyXG5cdFx0XHR9XHJcblx0XHRcdE9iamVjdC5rZXlzKG1vZC5hc3NldHMudGV4dHVyZXMgfHwge30pLm1hcChrID0+IG1vZC5hc3NldHMudGV4dHVyZXNba10pLmZvckVhY2goY2hlY2tBc3NldCk7XHJcblx0XHRcdE9iamVjdC5rZXlzKG1vZC5hc3NldHMubW9kZWxzIHx8IHt9KS5tYXAoayA9PiBtb2QuYXNzZXRzLm1vZGVsc1trXSkuZm9yRWFjaChjaGVja0Fzc2V0KTtcclxuXHRcdFx0T2JqZWN0LmtleXMobW9kLmFzc2V0cy5wb3N0ZXJzIHx8IHt9KS5tYXAoayA9PiBtb2QuYXNzZXRzLnBvc3RlcnNba10pLmZvckVhY2goY2hlY2tBc3NldCk7XHJcblx0XHR9KTtcclxuXHJcblx0XHQvLyBkZXRlcm1pbmUgaWYgdGhlIHRyYWNraW5nIHNrZWxldG9uIGlzIG5lZWRlZFxyXG5cdFx0bGV0IG5lZWRzU2tlbGV0b24gPSBtb2R1bGVzLnJlZHVjZSgobnMsbSkgPT4gbnMgfHwgbS5uZWVkc1NrZWxldG9uLCBmYWxzZSk7XHJcblx0XHRpZihuZWVkc1NrZWxldG9uICYmIGFsdHNwYWNlLmluQ2xpZW50KXtcclxuXHRcdFx0c2VsZi5fc2tlbFByb21pc2UgPSBQcm9taXNlLmFsbChbXHJcblx0XHRcdFx0YWx0c3BhY2UuZ2V0VGhyZWVKU1RyYWNraW5nU2tlbGV0b24oKSxcclxuXHRcdFx0XHRzZWxmLl9lbnZQcm9taXNlXHJcblx0XHRcdF0pLnRoZW4oc2tlbCA9PiB7XHJcblx0XHRcdFx0c2VsZi5zY2VuZS5hZGQoc2tlbCk7XHJcblx0XHRcdFx0c2VsZi5lbnYuc2tlbCA9IHNrZWw7XHJcblx0XHRcdFx0c2VsZi5lbnYgPSBPYmplY3QuZnJlZXplKHNlbGYuZW52KTtcclxuXHRcdFx0fSk7XHJcblx0XHR9XHJcblx0XHRlbHNlIHtcclxuXHRcdFx0c2VsZi5fZW52UHJvbWlzZS50aGVuKCgpID0+IHtcclxuXHRcdFx0XHRzZWxmLmVudiA9IE9iamVjdC5mcmVlemUoc2VsZi5lbnYpO1xyXG5cdFx0XHR9KTtcclxuXHRcdFx0c2VsZi5fc2tlbFByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcclxuXHRcdH1cclxuXHJcblx0XHRQcm9taXNlLmFsbChbc2VsZi5fZW52UHJvbWlzZSwgc2VsZi5fZnNQcm9taXNlLCBzZWxmLl9za2VsUHJvbWlzZV0pLnRoZW4oKCkgPT5cclxuXHRcdHtcclxuXHRcdFx0Ly8gY29uc3RydWN0IGRpb3JhbWFzXHJcblx0XHRcdG1vZHVsZXMuZm9yRWFjaChmdW5jdGlvbihtb2R1bGUpXHJcblx0XHRcdHtcclxuXHRcdFx0XHRsZXQgcm9vdCA9IG51bGw7XHJcblxyXG5cdFx0XHRcdGlmKG1vZHVsZSBpbnN0YW5jZW9mIFRIUkVFLk9iamVjdDNEKXtcclxuXHRcdFx0XHRcdHJvb3QgPSBtb2R1bGU7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdGVsc2VcclxuXHRcdFx0XHR7XHJcblx0XHRcdFx0XHRyb290ID0gbmV3IFRIUkVFLk9iamVjdDNEKCk7XHJcblxyXG5cdFx0XHRcdFx0Ly8gaGFuZGxlIGFic29sdXRlIHBvc2l0aW9uaW5nXHJcblx0XHRcdFx0XHRpZihtb2R1bGUudHJhbnNmb3JtKXtcclxuXHRcdFx0XHRcdFx0cm9vdC5tYXRyaXguZnJvbUFycmF5KG1vZHVsZS50cmFuc2Zvcm0pO1xyXG5cdFx0XHRcdFx0XHRyb290Lm1hdHJpeC5kZWNvbXBvc2Uocm9vdC5wb3NpdGlvbiwgcm9vdC5xdWF0ZXJuaW9uLCByb290LnNjYWxlKTtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdFx0XHRpZihtb2R1bGUucG9zaXRpb24pe1xyXG5cdFx0XHRcdFx0XHRcdHJvb3QucG9zaXRpb24uZnJvbUFycmF5KG1vZHVsZS5wb3NpdGlvbik7XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0aWYobW9kdWxlLnJvdGF0aW9uKXtcclxuXHRcdFx0XHRcdFx0XHRyb290LnJvdGF0aW9uLmZyb21BcnJheShtb2R1bGUucm90YXRpb24pO1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHQvLyBoYW5kbGUgcmVsYXRpdmUgcG9zaXRpb25pbmdcclxuXHRcdFx0XHRpZihtb2R1bGUudmVydGljYWxBbGlnbil7XHJcblx0XHRcdFx0XHRsZXQgaGFsZkhlaWdodCA9IHNlbGYuZW52LmlubmVySGVpZ2h0LygyKnNlbGYuZW52LnBpeGVsc1Blck1ldGVyKTtcclxuXHRcdFx0XHRcdHN3aXRjaChtb2R1bGUudmVydGljYWxBbGlnbil7XHJcblx0XHRcdFx0XHRjYXNlICd0b3AnOlxyXG5cdFx0XHRcdFx0XHRyb290LnRyYW5zbGF0ZVkoaGFsZkhlaWdodCk7XHJcblx0XHRcdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRcdFx0Y2FzZSAnYm90dG9tJzpcclxuXHRcdFx0XHRcdFx0cm9vdC50cmFuc2xhdGVZKC1oYWxmSGVpZ2h0KTtcclxuXHRcdFx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdFx0XHRjYXNlICdtaWRkbGUnOlxyXG5cdFx0XHRcdFx0XHQvLyBkZWZhdWx0XHJcblx0XHRcdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRcdFx0ZGVmYXVsdDpcclxuXHRcdFx0XHRcdFx0Y29uc29sZS53YXJuKCdJbnZhbGlkIHZhbHVlIGZvciBcInZlcnRpY2FsQWxpZ25cIiAtICcsIG1vZHVsZS52ZXJ0aWNhbEFsaWduKTtcclxuXHRcdFx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRzZWxmLnNjZW5lLmFkZChyb290KTtcclxuXHJcblx0XHRcdFx0aWYoc2VsZi5wcmV2aWV3Q2FtZXJhKXtcclxuXHRcdFx0XHRcdGxldCBheGlzID0gbmV3IFRIUkVFLkF4aXNIZWxwZXIoMSk7XHJcblx0XHRcdFx0XHRheGlzLnVzZXJEYXRhLmFsdHNwYWNlID0ge2NvbGxpZGVyOiB7ZW5hYmxlZDogZmFsc2V9fTtcclxuXHRcdFx0XHRcdHJvb3QuYWRkKGF4aXMpO1xyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0c2VsZi5sb2FkQXNzZXRzKG1vZHVsZS5hc3NldHMsIHNpbmdsZXRvbnMpLnRoZW4oKHJlc3VsdHMpID0+IHtcclxuXHRcdFx0XHRcdG1vZHVsZS5pbml0aWFsaXplKHNlbGYuZW52LCByb290LCByZXN1bHRzKTtcclxuXHRcdFx0XHR9KTtcclxuXHRcdFx0fSk7XHJcblx0XHR9KTtcclxuXHJcblx0XHQvLyBzdGFydCBhbmltYXRpbmdcclxuXHRcdHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoZnVuY3Rpb24gYW5pbWF0ZSh0aW1lc3RhbXApXHJcblx0XHR7XHJcblx0XHRcdHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoYW5pbWF0ZSk7XHJcblx0XHRcdHNlbGYuc2NlbmUudXBkYXRlQWxsQmVoYXZpb3JzKCk7XHJcblx0XHRcdGlmKHdpbmRvdy5UV0VFTikgVFdFRU4udXBkYXRlKCk7XHJcblx0XHRcdHNlbGYucmVuZGVyZXIucmVuZGVyKHNlbGYuc2NlbmUsIHNlbGYucHJldmlld0NhbWVyYSk7XHJcblx0XHR9KTtcclxuXHR9XHJcblxyXG5cdGxvYWRBc3NldHMobWFuaWZlc3QsIHNpbmdsZXRvbnMpXHJcblx0e1xyXG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xyXG5cclxuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PlxyXG5cdFx0e1xyXG5cdFx0XHQvLyBwb3B1bGF0ZSBjYWNoZVxyXG5cdFx0XHRQcm9taXNlLmFsbChbXHJcblxyXG5cdFx0XHRcdC8vIHBvcHVsYXRlIG1vZGVsIGNhY2hlXHJcblx0XHRcdFx0Li4uT2JqZWN0LmtleXMobWFuaWZlc3QubW9kZWxzIHx8IHt9KS5tYXAoaWQgPT4gTG9hZGVycy5Nb2RlbFByb21pc2UobWFuaWZlc3QubW9kZWxzW2lkXSkpLFxyXG5cclxuXHRcdFx0XHQvLyBwb3B1bGF0ZSBleHBsaWNpdCB0ZXh0dXJlIGNhY2hlXHJcblx0XHRcdFx0Li4uT2JqZWN0LmtleXMobWFuaWZlc3QudGV4dHVyZXMgfHwge30pLm1hcChpZCA9PiBMb2FkZXJzLlRleHR1cmVQcm9taXNlKG1hbmlmZXN0LnRleHR1cmVzW2lkXSkpLFxyXG5cclxuXHRcdFx0XHQvLyBnZW5lcmF0ZSBhbGwgcG9zdGVyc1xyXG5cdFx0XHRcdC4uLk9iamVjdC5rZXlzKG1hbmlmZXN0LnBvc3RlcnMgfHwge30pLm1hcChpZCA9PiBMb2FkZXJzLlBvc3RlclByb21pc2UobWFuaWZlc3QucG9zdGVyc1tpZF0pKVxyXG5cdFx0XHRdKVxyXG5cclxuXHRcdFx0LnRoZW4oKCkgPT5cclxuXHRcdFx0e1xyXG5cdFx0XHRcdC8vIHBvcHVsYXRlIHBheWxvYWQgZnJvbSBjYWNoZVxyXG5cdFx0XHRcdHZhciBwYXlsb2FkID0ge21vZGVsczoge30sIHRleHR1cmVzOiB7fSwgcG9zdGVyczoge319O1xyXG5cclxuXHRcdFx0XHRmb3IobGV0IGkgaW4gbWFuaWZlc3QubW9kZWxzKXtcclxuXHRcdFx0XHRcdGxldCB1cmwgPSBtYW5pZmVzdC5tb2RlbHNbaV07XHJcblx0XHRcdFx0XHRsZXQgdCA9IExvYWRlcnMuX2NhY2hlLm1vZGVsc1t1cmxdO1xyXG5cdFx0XHRcdFx0cGF5bG9hZC5tb2RlbHNbaV0gPSB0ID8gc2luZ2xldG9uc1t1cmxdID8gdCA6IHQuY2xvbmUoKSA6IG51bGw7XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRmb3IobGV0IGkgaW4gbWFuaWZlc3QudGV4dHVyZXMpe1xyXG5cdFx0XHRcdFx0bGV0IHVybCA9IG1hbmlmZXN0LnRleHR1cmVzW2ldO1xyXG5cdFx0XHRcdFx0bGV0IHQgPSBMb2FkZXJzLl9jYWNoZS50ZXh0dXJlc1t1cmxdO1xyXG5cdFx0XHRcdFx0cGF5bG9hZC50ZXh0dXJlc1tpXSA9IHQgPyBzaW5nbGV0b25zW3VybF0gPyB0IDogdC5jbG9uZSgpIDogbnVsbDtcclxuXHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdGZvcihsZXQgaSBpbiBtYW5pZmVzdC5wb3N0ZXJzKXtcclxuXHRcdFx0XHRcdGxldCB1cmwgPSBtYW5pZmVzdC5wb3N0ZXJzW2ldO1xyXG5cdFx0XHRcdFx0bGV0IHQgPSBMb2FkZXJzLl9jYWNoZS5wb3N0ZXJzW3VybF07XHJcblx0XHRcdFx0XHRwYXlsb2FkLnBvc3RlcnNbaV0gPSB0ID8gc2luZ2xldG9uc1t1cmxdID8gdCA6IHQuY2xvbmUoKSA6IG51bGw7XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRyZXNvbHZlKHBheWxvYWQpO1xyXG5cdFx0XHR9KVxyXG5cdFx0XHQuY2F0Y2goZSA9PiBjb25zb2xlLmVycm9yKGUuc3RhY2spKTtcclxuXHRcdH0pO1xyXG5cdH1cclxuXHJcbn07XHJcbiJdLCJuYW1lcyI6WyJsZXQiLCJsb2FkZXIiLCJzdXBlciIsInJpZ2h0IiwiTG9hZGVycy5fY2FjaGUiLCJMb2FkZXJzLk1vZGVsUHJvbWlzZSIsIkxvYWRlcnMuVGV4dHVyZVByb21pc2UiLCJMb2FkZXJzLlBvc3RlclByb21pc2UiLCJpIiwidXJsIiwidCJdLCJtYXBwaW5ncyI6Ijs7O0FBRUFBLElBQUksa0JBQWtCLEdBQUcsS0FBSyxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDOztBQUU1RCxTQUFTLFVBQVUsRUFBRSxHQUFHLEVBQUUsT0FBTztBQUNqQztDQUNDLEdBQUcsSUFBSSxDQUFDLFNBQVMsRUFBRSxFQUFBLE9BQU8sa0JBQWtCLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsT0FBTyxDQUFDLENBQUMsRUFBQTs7O0NBR3RFLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEVBQUU7RUFDNUQsSUFBSSxHQUFHLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxFQUFFO0dBQ3hCLEdBQUcsR0FBRyxRQUFRLENBQUMsTUFBTSxHQUFHLEdBQUcsQ0FBQztHQUM1QjtPQUNJO0dBQ0osSUFBSSxRQUFRLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQztHQUNqQyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRTtJQUM1QixRQUFRLEdBQUcsUUFB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
