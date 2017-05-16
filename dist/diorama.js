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

function PosterPromise(url, ratio){
	if ( ratio === void 0 ) ratio = -1;

	return new Promise(function (resolve, reject) {
		if(cache.posters[url]){
			return resolve(cache.posters[url]);
		}
		else { return (new TexturePromise(url, {forceLoad: ratio < 0})).then(function (tex) {
				if(ratio < 0)
					{ ratio = tex.image.width / tex.image.height; }

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
		]).then(function (skel, _) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjpudWxsLCJzb3VyY2VzIjpbIi4uL3NyYy9sb2FkZXJzLmpzIiwiLi4vc3JjL2NhbWVyYS5qcyIsIi4uL3NyYy9tYWluLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcclxuXHJcbmxldCBvcmlnaW5hbEdldFRleHR1cmUgPSBUSFJFRS5UZXh0dXJlTG9hZGVyLnByb3RvdHlwZS5sb2FkO1xyXG5cclxuZnVuY3Rpb24gZ2V0VGV4dHVyZSAodXJsLCByZXNvbHZlKVxyXG57XHJcblx0aWYodGhpcy5mb3JjZUxvYWQpIHJldHVybiBvcmlnaW5hbEdldFRleHR1cmUuY2FsbCh0aGlzLCB1cmwsIHJlc29sdmUpO1xyXG5cclxuXHQvLyBjb25zdHJ1Y3QgYWJzb2x1dGUgdXJsXHJcblx0aWYgKHVybCAmJiAhdXJsLnN0YXJ0c1dpdGgoJ2h0dHAnKSAmJiAhdXJsLnN0YXJ0c1dpdGgoJy8vJykpIHtcclxuXHRcdGlmICh1cmwuc3RhcnRzV2l0aCgnLycpKSB7XHJcblx0XHRcdHVybCA9IGxvY2F0aW9uLm9yaWdpbiArIHVybDtcclxuXHRcdH1cclxuXHRcdGVsc2Uge1xyXG5cdFx0XHR2YXIgY3VyclBhdGggPSBsb2NhdGlvbi5wYXRobmFtZTtcclxuXHRcdFx0aWYgKCFjdXJyUGF0aC5lbmRzV2l0aCgnLycpKSB7XHJcblx0XHRcdFx0Y3VyclBhdGggPSBsb2NhdGlvbi5wYXRobmFtZS5zcGxpdCgnLycpLnNsaWNlKDAsIC0xKS5qb2luKCcvJykgKyAnLyc7XHJcblx0XHRcdH1cclxuXHRcdFx0dXJsID0gbG9jYXRpb24ub3JpZ2luICsgY3VyclBhdGggKyB1cmw7XHJcblx0XHR9XHJcblx0fVxyXG5cdGNvbnNvbGUuaW5mbygnQWxsb3dpbmcgQWx0c3BhY2UgdG8gbG9hZCAnICsgdXJsKTtcclxuXHR2YXIgaW1hZ2UgPSB7c3JjOiB1cmx9O1xyXG5cdHZhciB0ZXggPSBuZXcgVEhSRUUuVGV4dHVyZShpbWFnZSk7XHJcblx0aWYgKHJlc29sdmUpIHtcclxuXHRcdHJlc29sdmUodGV4KTtcclxuXHR9XHJcblx0cmV0dXJuIHRleDtcclxufVxyXG5cclxuaWYoYWx0c3BhY2UuaW5DbGllbnQpXHJcbntcclxuXHRsZXQgbm9vcCA9ICgpID0+IHt9O1xyXG5cdFRIUkVFLkxvYWRlci5IYW5kbGVycy5hZGQoL2pwZT9nfHBuZy9pLCB7IGxvYWQ6IGdldFRleHR1cmUsIHNldENyb3NzT3JpZ2luOiBub29wIH0pO1xyXG5cdFRIUkVFLlRleHR1cmVMb2FkZXIucHJvdG90eXBlLmxvYWQgPSBnZXRUZXh0dXJlO1xyXG59XHJcblxyXG5sZXQgY2FjaGUgPSB7bW9kZWxzOiB7fSwgdGV4dHVyZXM6IHt9LCBwb3N0ZXJzOiB7fX07XHJcblxyXG5mdW5jdGlvbiBNb2RlbFByb21pc2UodXJsKVxyXG57XHJcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XHJcblx0e1xyXG5cdFx0aWYoY2FjaGUubW9kZWxzW3VybF0pe1xyXG5cdFx0XHRyZXR1cm4gcmVzb2x2ZShjYWNoZS5tb2RlbHNbdXJsXSk7XHJcblx0XHR9XHJcblxyXG5cdFx0Ly8gTk9URTogZ2xURiBsb2FkZXIgZG9lcyBub3QgY2F0Y2ggZXJyb3JzXHJcblx0XHRlbHNlIGlmKC9cXC5nbHRmJC9pLnRlc3QodXJsKSl7XHJcblx0XHRcdGlmKFRIUkVFLmdsVEZMb2FkZXIpe1xyXG5cdFx0XHRcdGxldCBsb2FkZXIgPSBuZXcgVEhSRUUuZ2xURkxvYWRlcigpO1xyXG5cdFx0XHRcdGxvYWRlci5sb2FkKHVybCwgKHJlc3VsdCkgPT4ge1xyXG5cdFx0XHRcdFx0Y2FjaGUubW9kZWxzW3VybF0gPSByZXN1bHQuc2NlbmUuY2hpbGRyZW5bMF0uY2hpbGRyZW5bMF07XHJcblx0XHRcdFx0XHRyZXR1cm4gcmVzb2x2ZShjYWNoZS5tb2RlbHNbdXJsXSk7XHJcblx0XHRcdFx0fSk7XHJcblx0XHRcdH1cclxuXHRcdFx0ZWxzZSBpZihUSFJFRS5HTFRGTG9hZGVyKXtcclxuXHRcdFx0XHRsZXQgbG9hZGVyID0gbmV3IFRIUkVFLkdMVEZMb2FkZXIoKTtcclxuXHRcdFx0XHRsb2FkZXIubG9hZCh1cmwsIHJlc3VsdCA9PiB7XHJcblx0XHRcdFx0XHRjYWNoZS5tb2RlbHNbdXJsXSA9IHJlc3VsdC5zY2VuZS5jaGlsZHJlblswXTtcclxuXHRcdFx0XHRcdGNhY2hlLm1vZGVsc1t1cmxdLm1hdHJpeEF1dG9VcGRhdGUgPSB0cnVlO1xyXG5cdFx0XHRcdFx0LypyZXN1bHQuc2NlbmUudHJhdmVyc2UoKG8pID0+IHtcclxuXHRcdFx0XHRcdFx0aWYoby5tYXRlcmlhbCAmJiBvLm1hdGVyaWFsLm1hcClcclxuXHRcdFx0XHRcdFx0XHRjb25zb2xlLmxvZygnZmxpcFknLCBvLm1hdGVyaWFsLm1hcC5mbGlwWSk7XHJcblx0XHRcdFx0XHR9KTsqL1xyXG5cclxuXHJcblx0XHRcdFx0XHRyZXR1cm4gcmVzb2x2ZShjYWNoZS5tb2RlbHNbdXJsXSk7XHJcblx0XHRcdFx0fSwgKCkgPT4ge30sIHJlamVjdCk7XHJcblx0XHRcdH1cclxuXHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0Y29uc29sZS5lcnJvcihgZ2xURiBsb2FkZXIgbm90IGZvdW5kLiBcIiR7dXJsfVwiIG5vdCBsb2FkZWQuYCk7XHJcblx0XHRcdFx0cmVqZWN0KCk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHRlbHNlIGlmKC9cXC5kYWUkL2kudGVzdCh1cmwpKXtcclxuXHRcdFx0aWYoVEhSRUUuQ29sbGFkYUxvYWRlcil7XHJcblx0XHRcdFx0bGV0IGxvYWRlciA9IG5ldyBUSFJFRS5Db2xsYWRhTG9hZGVyKCk7XHJcblx0XHRcdFx0bG9hZGVyLmxvYWQodXJsLCByZXN1bHQgPT4ge1xyXG5cdFx0XHRcdFx0Y2FjaGUubW9kZWxzW3VybF0gPSByZXN1bHQuc2NlbmUuY2hpbGRyZW5bMF07XHJcblx0XHRcdFx0XHRyZXR1cm4gcmVzb2x2ZShyZXN1bHQuc2NlbmUuY2hpbGRyZW5bMF0pXHJcblx0XHRcdFx0fSwgbnVsbCwgcmVqZWN0KTtcclxuXHRcdFx0fVxyXG5cdFx0XHRlbHNlIHtcclxuXHRcdFx0XHRjb25zb2xlLmVycm9yKGBDb2xsYWRhIGxvYWRlciBub3QgZm91bmQuIFwiJHt1cmx9XCIgbm90IGxvYWRlZC5gKTtcclxuXHRcdFx0XHRyZWplY3QoKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cdH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBUZXh0dXJlUHJvbWlzZSh1cmwsIGNvbmZpZyA9IHtmb3JjZUxvYWQ6IGZhbHNlfSl7XHJcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XHJcblx0e1xyXG5cdFx0aWYoY2FjaGUudGV4dHVyZXNbdXJsXSlcclxuXHRcdFx0cmV0dXJuIHJlc29sdmUoY2FjaGUudGV4dHVyZXNbdXJsXSk7XHJcblx0XHRlbHNlIHtcclxuXHRcdFx0bGV0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKCk7XHJcblx0XHRcdGxvYWRlci5mb3JjZUxvYWQgPSBjb25maWcuZm9yY2VMb2FkO1xyXG5cdFx0XHRsb2FkZXIubG9hZCh1cmwsIHRleHR1cmUgPT4ge1xyXG5cdFx0XHRcdGNhY2hlLnRleHR1cmVzW3VybF0gPSB0ZXh0dXJlO1xyXG5cdFx0XHRcdHJldHVybiByZXNvbHZlKHRleHR1cmUpO1xyXG5cdFx0XHR9LCBudWxsLCByZWplY3QpO1xyXG5cdFx0fVxyXG5cdH0pO1xyXG59XHJcblxyXG5jbGFzcyBWaWRlb1Byb21pc2UgZXh0ZW5kcyBQcm9taXNlIHtcclxuXHRjb25zdHJ1Y3Rvcih1cmwpXHJcblx0e1xyXG5cdFx0Ly8gc3RhcnQgbG9hZGVyXHJcblx0XHR2YXIgdmlkU3JjID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndmlkZW8nKTtcclxuXHRcdHZpZFNyYy5hdXRvcGxheSA9IHRydWU7XHJcblx0XHR2aWRTcmMubG9vcCA9IHRydWU7XHJcblx0XHR2aWRTcmMuc3JjID0gdXJsO1xyXG5cdFx0dmlkU3JjLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XHJcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHZpZFNyYyk7XHJcblxyXG5cdFx0dmFyIHRleCA9IG5ldyBUSFJFRS5WaWRlb1RleHR1cmUodmlkU3JjKTtcclxuXHRcdHRleC5taW5GaWx0ZXIgPSBUSFJFRS5MaW5lYXJGaWx0ZXI7XHJcblx0XHR0ZXgubWFnRmlsdGVyID0gVEhSRUUuTGluZWFyRmlsdGVyO1xyXG5cdFx0dGV4LmZvcm1hdCA9IFRIUkVFLlJHQkZvcm1hdDtcclxuXHJcblx0XHQvL2NhY2hlLnZpZGVvc1t1cmxdID0gdGV4O1xyXG5cdFx0Ly9wYXlsb2FkLnZpZGVvc1tpZF0gPSBjYWNoZS52aWRlb3NbdXJsXTtcclxuXHJcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRleCk7XHJcblx0fVxyXG59XHJcblxyXG5mdW5jdGlvbiBQb3N0ZXJQcm9taXNlKHVybCwgcmF0aW8gPSAtMSl7XHJcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XHJcblx0e1xyXG5cdFx0aWYoY2FjaGUucG9zdGVyc1t1cmxdKXtcclxuXHRcdFx0cmV0dXJuIHJlc29sdmUoY2FjaGUucG9zdGVyc1t1cmxdKTtcclxuXHRcdH1cclxuXHRcdGVsc2UgcmV0dXJuIChuZXcgVGV4dHVyZVByb21pc2UodXJsLCB7Zm9yY2VMb2FkOiByYXRpbyA8IDB9KSkudGhlbih0ZXggPT5cclxuXHRcdFx0e1xyXG5cdFx0XHRcdGlmKHJhdGlvIDwgMClcclxuXHRcdFx0XHRcdHJhdGlvID0gdGV4LmltYWdlLndpZHRoIC8gdGV4LmltYWdlLmhlaWdodDtcclxuXHJcblx0XHRcdFx0bGV0IGdlbywgbWF0ID0gbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHttYXA6IHRleCwgc2lkZTogVEhSRUUuRG91YmxlU2lkZX0pO1xyXG5cclxuXHRcdFx0XHRpZihyYXRpbyA+IDEpe1xyXG5cdFx0XHRcdFx0Z2VvID0gbmV3IFRIUkVFLlBsYW5lR2VvbWV0cnkoMSwgMS9yYXRpbyk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdFx0Z2VvID0gbmV3IFRIUkVFLlBsYW5lR2VvbWV0cnkocmF0aW8sIDEpO1xyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0Y2FjaGUucG9zdGVyc1t1cmxdID0gbmV3IFRIUkVFLk1lc2goZ2VvLCBtYXQpO1xyXG5cdFx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLnBvc3RlcnNbdXJsXSk7XHJcblx0XHRcdH1cclxuXHRcdCk7XHJcblx0fSk7XHJcbn1cclxuXHJcbmV4cG9ydCB7IE1vZGVsUHJvbWlzZSwgVGV4dHVyZVByb21pc2UsIFZpZGVvUHJvbWlzZSwgUG9zdGVyUHJvbWlzZSwgY2FjaGUgYXMgX2NhY2hlIH07XHJcbiIsIid1c2Ugc3RyaWN0JztcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFByZXZpZXdDYW1lcmEgZXh0ZW5kcyBUSFJFRS5PcnRob2dyYXBoaWNDYW1lcmFcclxue1xyXG5cdGNvbnN0cnVjdG9yKGZvY3VzLCB2aWV3U2l6ZSwgbG9va0RpcmVjdGlvbilcclxuXHR7XHJcblx0XHRzdXBlcigtMSwgMSwgMSwgLTEsIC4xLCA0MDApO1xyXG5cclxuXHRcdGxldCBzZXR0aW5ncyA9IHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnZGlvcmFtYVZpZXdTZXR0aW5ncycpO1xyXG5cdFx0aWYoc2V0dGluZ3Mpe1xyXG5cdFx0XHRzZXR0aW5ncyA9IEpTT04ucGFyc2Uoc2V0dGluZ3MpO1xyXG5cdFx0XHRpZighZm9jdXMpXHJcblx0XHRcdFx0Zm9jdXMgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmZyb21BcnJheShzZXR0aW5ncy5mb2N1cyk7XHJcblx0XHRcdGlmKCF2aWV3U2l6ZSlcclxuXHRcdFx0XHR2aWV3U2l6ZSA9IHNldHRpbmdzLnZpZXdTaXplO1xyXG5cdFx0XHRpZighbG9va0RpcmVjdGlvbilcclxuXHRcdFx0XHRsb29rRGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5mcm9tQXJyYXkoc2V0dGluZ3MubG9va0RpcmVjdGlvbik7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fdmlld1NpemUgPSB2aWV3U2l6ZSB8fCA0MDtcclxuXHRcdHRoaXMuX2ZvY3VzID0gZm9jdXMgfHwgbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuXHRcdHRoaXMuX2xvb2tEaXJlY3Rpb24gPSBsb29rRGlyZWN0aW9uIHx8IG5ldyBUSFJFRS5WZWN0b3IzKDAsLTEsMCk7XHJcblx0XHR0aGlzLmdyaWRIZWxwZXIgPSBuZXcgVEhSRUUuR3JpZEhlbHBlcigzMDAsIDEpO1xyXG5cdFx0dGhpcy5ncmlkSGVscGVyLnVzZXJEYXRhID0ge2FsdHNwYWNlOiB7Y29sbGlkZXI6IHtlbmFibGVkOiBmYWxzZX19fTtcclxuXHRcdC8vdGhpcy5ncmlkSGVscGVyLnF1YXRlcm5pb24uc2V0RnJvbVVuaXRWZWN0b3JzKCBuZXcgVEhSRUUuVmVjdG9yMygwLC0xLDApLCB0aGlzLl9sb29rRGlyZWN0aW9uICk7XHJcblx0fVxyXG5cclxuXHRnZXQgdmlld1NpemUoKXtcclxuXHRcdHJldHVybiB0aGlzLl92aWV3U2l6ZTtcclxuXHR9XHJcblx0c2V0IHZpZXdTaXplKHZhbCl7XHJcblx0XHR0aGlzLl92aWV3U2l6ZSA9IHZhbDtcclxuXHRcdHRoaXMucmVjb21wdXRlVmlld3BvcnQoKTtcclxuXHR9XHJcblxyXG5cdGdldCBmb2N1cygpe1xyXG5cdFx0cmV0dXJuIHRoaXMuX2ZvY3VzO1xyXG5cdH1cclxuXHRzZXQgZm9jdXModmFsKXtcclxuXHRcdHRoaXMuX2ZvY3VzLmNvcHkodmFsKTtcclxuXHRcdHRoaXMucmVjb21wdXRlVmlld3BvcnQoKTtcclxuXHR9XHJcblxyXG5cdGdldCBsb29rRGlyZWN0aW9uKCl7XHJcblx0XHRyZXR1cm4gdGhpcy5fbG9va0RpcmVjdGlvbjtcclxuXHR9XHJcblx0c2V0IGxvb2tEaXJlY3Rpb24odmFsKXtcclxuXHRcdHRoaXMuX2xvb2tEaXJlY3Rpb24uY29weSh2YWwpO1xyXG5cdFx0dGhpcy5yZWNvbXB1dGVWaWV3cG9ydCgpO1xyXG5cdH1cclxuXHJcblx0cmVnaXN0ZXJIb29rcyhyZW5kZXJlcilcclxuXHR7XHJcblx0XHR2YXIgc2VsZiA9IHRoaXM7XHJcblx0XHRzZWxmLnJlbmRlcmVyID0gcmVuZGVyZXI7XHJcblxyXG5cdFx0Ly8gc2V0IHN0eWxlcyBvbiB0aGUgcGFnZSwgc28gdGhlIHByZXZpZXcgd29ya3MgcmlnaHRcclxuXHRcdGRvY3VtZW50LmJvZHkucGFyZW50RWxlbWVudC5zdHlsZS5oZWlnaHQgPSAnMTAwJSc7XHJcblx0XHRkb2N1bWVudC5ib2R5LnN0eWxlLmhlaWdodCA9ICcxMDAlJztcclxuXHRcdGRvY3VtZW50LmJvZHkuc3R5bGUubWFyZ2luID0gJzAnO1xyXG5cdFx0ZG9jdW1lbnQuYm9keS5zdHlsZS5vdmVyZmxvdyA9ICdoaWRkZW4nO1xyXG5cclxuXHRcdHZhciBpbmZvID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncCcpO1xyXG5cdFx0aW5mby5pbm5lckhUTUwgPSBbJ01pZGRsZSBjbGljayBhbmQgZHJhZyB0byBwYW4nLCAnTW91c2Ugd2hlZWwgdG8gem9vbScsICdBcnJvdyBrZXlzIHRvIHJvdGF0ZSddLmpvaW4oJzxici8+Jyk7XHJcblx0XHRPYmplY3QuYXNzaWduKGluZm8uc3R5bGUsIHtcclxuXHRcdFx0cG9zaXRpb246ICdmaXhlZCcsXHJcblx0XHRcdHRvcDogJzEwcHgnLFxyXG5cdFx0XHRsZWZ0OiAnMTBweCcsXHJcblx0XHRcdG1hcmdpbjogMFxyXG5cdFx0fSk7XHJcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGluZm8pO1xyXG5cclxuXHRcdC8vIHJlc2l6ZSB0aGUgcHJldmlldyBjYW52YXMgd2hlbiB3aW5kb3cgcmVzaXplc1xyXG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIGUgPT4gc2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpKTtcclxuXHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcclxuXHJcblx0XHQvLyBtaWRkbGUgY2xpY2sgYW5kIGRyYWcgdG8gcGFuIHZpZXdcclxuXHRcdHZhciBkcmFnU3RhcnQgPSBudWxsLCBmb2N1c1N0YXJ0ID0gbnVsbDtcclxuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBlID0+IHtcclxuXHRcdFx0aWYoZS5idXR0b24gPT09IDEpe1xyXG5cdFx0XHRcdGRyYWdTdGFydCA9IHt4OiBlLmNsaWVudFgsIHk6IGUuY2xpZW50WX07XHJcblx0XHRcdFx0Zm9jdXNTdGFydCA9IHNlbGYuX2ZvY3VzLmNsb25lKCk7XHJcblx0XHRcdH1cclxuXHRcdH0pO1xyXG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCBlID0+IHtcclxuXHRcdFx0aWYoZS5idXR0b24gPT09IDEpe1xyXG5cdFx0XHRcdGRyYWdTdGFydCA9IG51bGw7XHJcblx0XHRcdFx0Zm9jdXNTdGFydCA9IG51bGw7XHJcblx0XHRcdH1cclxuXHRcdH0pO1xyXG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIGUgPT4ge1xyXG5cdFx0XHRpZihkcmFnU3RhcnQpXHJcblx0XHRcdHtcclxuXHRcdFx0XHRsZXQge2NsaWVudFdpZHRoOiB3LCBjbGllbnRIZWlnaHQ6IGh9ID0gZG9jdW1lbnQuYm9keTtcclxuXHRcdFx0XHRsZXQgcGl4ZWxzUGVyTWV0ZXIgPSBNYXRoLnNxcnQodyp3K2gqaCkgLyBzZWxmLl92aWV3U2l6ZTtcclxuXHRcdFx0XHRsZXQgZHggPSBlLmNsaWVudFggLSBkcmFnU3RhcnQueCwgZHkgPSBlLmNsaWVudFkgLSBkcmFnU3RhcnQueTtcclxuXHRcdFx0XHRsZXQgcmlnaHQgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmNyb3NzVmVjdG9ycyhzZWxmLl9sb29rRGlyZWN0aW9uLCBzZWxmLnVwKTtcclxuXHJcblx0XHRcdFx0c2VsZi5fZm9jdXMuY29weShmb2N1c1N0YXJ0KVxyXG5cdFx0XHRcdFx0LmFkZChzZWxmLnVwLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoZHkvcGl4ZWxzUGVyTWV0ZXIpKVxyXG5cdFx0XHRcdFx0LmFkZChyaWdodC5tdWx0aXBseVNjYWxhcigtZHgvcGl4ZWxzUGVyTWV0ZXIpKTtcclxuXHJcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xyXG5cdFx0XHR9XHJcblx0XHR9KTtcclxuXHJcblx0XHQvLyB3aGVlbCB0byB6b29tXHJcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignd2hlZWwnLCBlID0+IHtcclxuXHRcdFx0aWYoZS5kZWx0YVkgPCAwKXtcclxuXHRcdFx0XHRzZWxmLl92aWV3U2l6ZSAqPSAwLjkwO1xyXG5cdFx0XHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRlbHNlIGlmKGUuZGVsdGFZID4gMCl7XHJcblx0XHRcdFx0c2VsZi5fdmlld1NpemUgKj0gMS4xO1xyXG5cdFx0XHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblxyXG5cdFx0Ly8gYXJyb3cga2V5cyB0byByb3RhdGVcclxuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgZSA9PiB7XHJcblx0XHRcdGlmKGUua2V5ID09PSAnQXJyb3dEb3duJyl7XHJcblx0XHRcdFx0bGV0IHJpZ2h0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5jcm9zc1ZlY3RvcnMoc2VsZi5fbG9va0RpcmVjdGlvbiwgc2VsZi51cCk7XHJcblx0XHRcdFx0c2VsZi5fbG9va0RpcmVjdGlvbi5hcHBseUF4aXNBbmdsZShyaWdodCwgTWF0aC5QSS8yKTtcclxuXHRcdFx0XHQvL3NlbGYuZ3JpZEhlbHBlci5yb3RhdGVPbkF4aXMocmlnaHQsIE1hdGguUEkvMik7XHJcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2UgaWYoZS5rZXkgPT09ICdBcnJvd1VwJyl7XHJcblx0XHRcdFx0bGV0IHJpZ2h0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5jcm9zc1ZlY3RvcnMoc2VsZi5fbG9va0RpcmVjdGlvbiwgc2VsZi51cCk7XHJcblx0XHRcdFx0c2VsZi5fbG9va0RpcmVjdGlvbi5hcHBseUF4aXNBbmdsZShyaWdodCwgLU1hdGguUEkvMik7XHJcblx0XHRcdFx0Ly9zZWxmLmdyaWRIZWxwZXIucm90YXRlT25BeGlzKHJpZ2h0LCAtTWF0aC5QSS8yKTtcclxuXHRcdFx0XHRzZWxmLnJlY29tcHV0ZVZpZXdwb3J0KCk7XHJcblxyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2UgaWYoZS5rZXkgPT09ICdBcnJvd0xlZnQnKXtcclxuXHRcdFx0XHRzZWxmLl9sb29rRGlyZWN0aW9uLmFwcGx5QXhpc0FuZ2xlKHNlbGYudXAsIC1NYXRoLlBJLzIpO1xyXG5cdFx0XHRcdC8vc2VsZi5ncmlkSGVscGVyLnJvdGF0ZU9uQXhpcyhzZWxmLnVwLCAtTWF0aC5QSS8yKTtcclxuXHRcdFx0XHRzZWxmLnJlY29tcHV0ZVZpZXdwb3J0KCk7XHJcblx0XHRcdH1cclxuXHRcdFx0ZWxzZSBpZihlLmtleSA9PT0gJ0Fycm93UmlnaHQnKXtcclxuXHRcdFx0XHRzZWxmLl9sb29rRGlyZWN0aW9uLmFwcGx5QXhpc0FuZ2xlKHNlbGYudXAsIE1hdGguUEkvMik7XHJcblx0XHRcdFx0Ly9zZWxmLmdyaWRIZWxwZXIucm90YXRlT25BeGlzKHNlbGYudXAsIE1hdGguUEkvMik7XHJcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xyXG5cdFx0XHR9XHJcblx0XHR9KTtcclxuXHR9XHJcblxyXG5cdHJlY29tcHV0ZVZpZXdwb3J0KClcclxuXHR7XHJcblx0XHR2YXIge2NsaWVudFdpZHRoOiB3LCBjbGllbnRIZWlnaHQ6IGh9ID0gZG9jdW1lbnQuYm9keTtcclxuXHJcblx0XHQvLyByZXNpemUgY2FudmFzXHJcblx0XHR0aGlzLnJlbmRlcmVyLnNldFNpemUodywgaCk7XHJcblxyXG5cdFx0Ly8gY29tcHV0ZSB3aW5kb3cgZGltZW5zaW9ucyBmcm9tIHZpZXcgc2l6ZVxyXG5cdFx0dmFyIHJhdGlvID0gdy9oO1xyXG5cdFx0dmFyIGhlaWdodCA9IE1hdGguc3FydCggKHRoaXMuX3ZpZXdTaXplKnRoaXMuX3ZpZXdTaXplKSAvIChyYXRpbypyYXRpbyArIDEpICk7XHJcblx0XHR2YXIgd2lkdGggPSByYXRpbyAqIGhlaWdodDtcclxuXHJcblx0XHQvLyBzZXQgZnJ1c3RydW0gZWRnZXNcclxuXHRcdHRoaXMubGVmdCA9IC13aWR0aC8yO1xyXG5cdFx0dGhpcy5yaWdodCA9IHdpZHRoLzI7XHJcblx0XHR0aGlzLnRvcCA9IGhlaWdodC8yO1xyXG5cdFx0dGhpcy5ib3R0b20gPSAtaGVpZ2h0LzI7XHJcblxyXG5cdFx0dGhpcy51cGRhdGVQcm9qZWN0aW9uTWF0cml4KCk7XHJcblxyXG5cdFx0Ly8gdXBkYXRlIHBvc2l0aW9uXHJcblx0XHR0aGlzLnBvc2l0aW9uLmNvcHkodGhpcy5fZm9jdXMpLnN1YiggdGhpcy5fbG9va0RpcmVjdGlvbi5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKDIwMCkgKTtcclxuXHRcdGlmKCBNYXRoLmFicyggdGhpcy5fbG9va0RpcmVjdGlvbi5ub3JtYWxpemUoKS5kb3QobmV3IFRIUkVFLlZlY3RvcjMoMCwtMSwwKSkgKSA9PT0gMSApXHJcblx0XHRcdHRoaXMudXAuc2V0KDAsMCwxKTsgLy8gaWYgd2UncmUgbG9va2luZyBkb3duIHRoZSBZIGF4aXNcclxuXHRcdGVsc2VcclxuXHRcdFx0dGhpcy51cC5zZXQoMCwxLDApO1xyXG5cdFx0dGhpcy5sb29rQXQoIHRoaXMuX2ZvY3VzICk7XHJcblxyXG5cdFx0d2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKCdkaW9yYW1hVmlld1NldHRpbmdzJywgSlNPTi5zdHJpbmdpZnkoe1xyXG5cdFx0XHRmb2N1czogdGhpcy5fZm9jdXMudG9BcnJheSgpLFxyXG5cdFx0XHR2aWV3U2l6ZTogdGhpcy5fdmlld1NpemUsXHJcblx0XHRcdGxvb2tEaXJlY3Rpb246IHRoaXMuX2xvb2tEaXJlY3Rpb24udG9BcnJheSgpXHJcblx0XHR9KSk7XHJcblx0fVxyXG59XHJcbiIsIid1c2Ugc3RyaWN0JztcclxuXHJcbmltcG9ydCAqIGFzIExvYWRlcnMgZnJvbSAnLi9sb2FkZXJzJztcclxuaW1wb3J0IFByZXZpZXdDYW1lcmEgZnJvbSAnLi9jYW1lcmEnO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRGlvcmFtYVxyXG57XHJcblx0Y29uc3RydWN0b3Ioe2JnQ29sb3I9MHhhYWFhYWEsIGdyaWRPZmZzZXQ9WzAsMCwwXSwgZnVsbHNwYWNlPWZhbHNlfSA9IHt9KVxyXG5cdHtcclxuXHRcdHZhciBzZWxmID0gdGhpcztcclxuXHRcdHNlbGYuX2NhY2hlID0gTG9hZGVycy5fY2FjaGU7XHJcblx0XHRzZWxmLnNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XHJcblxyXG5cdFx0Ly8gc2V0IHVwIHJlbmRlcmVyIGFuZCBzY2FsZVxyXG5cdFx0aWYoYWx0c3BhY2UuaW5DbGllbnQpXHJcblx0XHR7XHJcblx0XHRcdHNlbGYucmVuZGVyZXIgPSBhbHRzcGFjZS5nZXRUaHJlZUpTUmVuZGVyZXIoKTtcclxuXHRcdFx0c2VsZi5fZW52UHJvbWlzZSA9IFByb21pc2UuYWxsKFthbHRzcGFjZS5nZXRFbmNsb3N1cmUoKSwgYWx0c3BhY2UuZ2V0U3BhY2UoKV0pXHJcblx0XHRcdC50aGVuKChbZSwgc10pID0+IHtcclxuXHJcblx0XHRcdFx0ZnVuY3Rpb24gYWRqdXN0U2NhbGUoKXtcclxuXHRcdFx0XHRcdHNlbGYuc2NlbmUuc2NhbGUuc2V0U2NhbGFyKGUucGl4ZWxzUGVyTWV0ZXIpO1xyXG5cdFx0XHRcdFx0c2VsZi5lbnYgPSBPYmplY3QuYXNzaWduKHt9LCBlLCBzKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0YWRqdXN0U2NhbGUoKTtcclxuXHJcblx0XHRcdFx0aWYoZnVsbHNwYWNlKXtcclxuXHRcdFx0XHRcdHNlbGYuX2ZzUHJvbWlzZSA9IGUucmVxdWVzdEZ1bGxzcGFjZSgpLmNhdGNoKChlKSA9PiBjb25zb2xlLndhcm4oJ1JlcXVlc3QgZm9yIGZ1bGxzcGFjZSBkZW5pZWQnKSk7XHJcblx0XHRcdFx0XHRlLmFkZEV2ZW50TGlzdGVuZXIoJ2Z1bGxzcGFjZWNoYW5nZScsIGFkanVzdFNjYWxlKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0ZWxzZVxyXG5cdFx0XHRcdFx0c2VsZi5fZnNQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XHJcblx0XHRcdH0pO1xyXG5cdFx0fVxyXG5cdFx0ZWxzZVxyXG5cdFx0e1xyXG5cdFx0XHQvLyBzZXQgdXAgcHJldmlldyByZW5kZXJlciwgaW4gY2FzZSB3ZSdyZSBvdXQgb2Ygd29ybGRcclxuXHRcdFx0c2VsZi5yZW5kZXJlciA9IG5ldyBUSFJFRS5XZWJHTFJlbmRlcmVyKCk7XHJcblx0XHRcdHNlbGYucmVuZGVyZXIuc2V0U2l6ZShkb2N1bWVudC5ib2R5LmNsaWVudFdpZHRoLCBkb2N1bWVudC5ib2R5LmNsaWVudEhlaWdodCk7XHJcblx0XHRcdHNlbGYucmVuZGVyZXIuc2V0Q2xlYXJDb2xvciggYmdDb2xvciApO1xyXG5cdFx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHNlbGYucmVuZGVyZXIuZG9tRWxlbWVudCk7XHJcblxyXG5cdFx0XHRzZWxmLnByZXZpZXdDYW1lcmEgPSBuZXcgUHJldmlld0NhbWVyYSgpO1xyXG5cdFx0XHRzZWxmLnByZXZpZXdDYW1lcmEuZ3JpZEhlbHBlci5wb3NpdGlvbi5mcm9tQXJyYXkoZ3JpZE9mZnNldCk7XHJcblx0XHRcdHNlbGYuc2NlbmUuYWRkKHNlbGYucHJldmlld0NhbWVyYSwgc2VsZi5wcmV2aWV3Q2FtZXJhLmdyaWRIZWxwZXIpO1xyXG5cdFx0XHRzZWxmLnByZXZpZXdDYW1lcmEucmVnaXN0ZXJIb29rcyhzZWxmLnJlbmRlcmVyKTtcclxuXHJcblx0XHRcdC8vIHNldCB1cCBjdXJzb3IgZW11bGF0aW9uXHJcblx0XHRcdGFsdHNwYWNlLnV0aWxpdGllcy5zaGltcy5jdXJzb3IuaW5pdChzZWxmLnNjZW5lLCBzZWxmLnByZXZpZXdDYW1lcmEsIHtyZW5kZXJlcjogc2VsZi5yZW5kZXJlcn0pO1xyXG5cclxuXHRcdFx0Ly8gc3R1YiBlbnZpcm9ubWVudFxyXG5cdFx0XHRzZWxmLmVudiA9IHtcclxuXHRcdFx0XHRpbm5lcldpZHRoOiAxMDI0LFxyXG5cdFx0XHRcdGlubmVySGVpZ2h0OiAxMDI0LFxyXG5cdFx0XHRcdGlubmVyRGVwdGg6IDEwMjQsXHJcblx0XHRcdFx0cGl4ZWxzUGVyTWV0ZXI6IGZ1bGxzcGFjZSA/IDEgOiAxMDI0LzMsXHJcblx0XHRcdFx0c2lkOiAnYnJvd3NlcicsXHJcblx0XHRcdFx0bmFtZTogJ2Jyb3dzZXInLFxyXG5cdFx0XHRcdHRlbXBsYXRlU2lkOiAnYnJvd3NlcidcclxuXHRcdFx0fTtcclxuXHJcblx0XHRcdHNlbGYuX2VudlByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcclxuXHRcdFx0c2VsZi5fZnNQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHJcblx0c3RhcnQoLi4ubW9kdWxlcylcclxuXHR7XHJcblx0XHR2YXIgc2VsZiA9IHRoaXM7XHJcblxyXG5cdFx0Ly8gZGV0ZXJtaW5lIHdoaWNoIGFzc2V0cyBhcmVuJ3Qgc2hhcmVkXHJcblx0XHR2YXIgc2luZ2xldG9ucyA9IHt9O1xyXG5cdFx0bW9kdWxlcy5mb3JFYWNoKG1vZCA9PlxyXG5cdFx0e1xyXG5cdFx0XHRmdW5jdGlvbiBjaGVja0Fzc2V0KHVybCl7XHJcblx0XHRcdFx0aWYoc2luZ2xldG9uc1t1cmxdID09PSB1bmRlZmluZWQpIHNpbmdsZXRvbnNbdXJsXSA9IHRydWU7XHJcblx0XHRcdFx0ZWxzZSBpZihzaW5nbGV0b25zW3VybF0gPT09IHRydWUpIHNpbmdsZXRvbnNbdXJsXSA9IGZhbHNlO1xyXG5cdFx0XHR9XHJcblx0XHRcdE9iamVjdC5rZXlzKG1vZC5hc3NldHMudGV4dHVyZXMgfHwge30pLm1hcChrID0+IG1vZC5hc3NldHMudGV4dHVyZXNba10pLmZvckVhY2goY2hlY2tBc3NldCk7XHJcblx0XHRcdE9iamVjdC5rZXlzKG1vZC5hc3NldHMubW9kZWxzIHx8IHt9KS5tYXAoayA9PiBtb2QuYXNzZXRzLm1vZGVsc1trXSkuZm9yRWFjaChjaGVja0Fzc2V0KTtcclxuXHRcdFx0T2JqZWN0LmtleXMobW9kLmFzc2V0cy5wb3N0ZXJzIHx8IHt9KS5tYXAoayA9PiBtb2QuYXNzZXRzLnBvc3RlcnNba10pLmZvckVhY2goY2hlY2tBc3NldCk7XHJcblx0XHR9KTtcclxuXHJcblx0XHQvLyBkZXRlcm1pbmUgaWYgdGhlIHRyYWNraW5nIHNrZWxldG9uIGlzIG5lZWRlZFxyXG5cdFx0bGV0IG5lZWRzU2tlbGV0b24gPSBtb2R1bGVzLnJlZHVjZSgobnMsbSkgPT4gbnMgfHwgbS5uZWVkc1NrZWxldG9uLCBmYWxzZSk7XHJcblx0XHRpZihuZWVkc1NrZWxldG9uICYmIGFsdHNwYWNlLmluQ2xpZW50KXtcclxuXHRcdFx0c2VsZi5fc2tlbFByb21pc2UgPSBQcm9taXNlLmFsbChbXHJcblx0XHRcdFx0YWx0c3BhY2UuZ2V0VGhyZWVKU1RyYWNraW5nU2tlbGV0b24oKSxcclxuXHRcdFx0XHRzZWxmLl9lbnZQcm9taXNlXHJcblx0XHRcdF0pLnRoZW4oKHNrZWwsIF8pID0+IHtcclxuXHRcdFx0XHRzZWxmLnNjZW5lLmFkZChza2VsKTtcclxuXHRcdFx0XHRzZWxmLmVudi5za2VsID0gc2tlbDtcclxuXHRcdFx0XHRzZWxmLmVudiA9IE9iamVjdC5mcmVlemUoc2VsZi5lbnYpO1xyXG5cdFx0XHR9KTtcclxuXHRcdH1cclxuXHRcdGVsc2Uge1xyXG5cdFx0XHRzZWxmLl9lbnZQcm9taXNlLnRoZW4oKCkgPT4ge1xyXG5cdFx0XHRcdHNlbGYuZW52ID0gT2JqZWN0LmZyZWV6ZShzZWxmLmVudik7XHJcblx0XHRcdH0pO1xyXG5cdFx0XHRzZWxmLl9za2VsUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xyXG5cdFx0fVxyXG5cclxuXHRcdFByb21pc2UuYWxsKFtzZWxmLl9lbnZQcm9taXNlLCBzZWxmLl9mc1Byb21pc2UsIHNlbGYuX3NrZWxQcm9taXNlXSkudGhlbigoKSA9PlxyXG5cdFx0e1xyXG5cdFx0XHQvLyBjb25zdHJ1Y3QgZGlvcmFtYXNcclxuXHRcdFx0bW9kdWxlcy5mb3JFYWNoKGZ1bmN0aW9uKG1vZHVsZSlcclxuXHRcdFx0e1xyXG5cdFx0XHRcdGxldCByb290ID0gbnVsbDtcclxuXHJcblx0XHRcdFx0aWYobW9kdWxlIGluc3RhbmNlb2YgVEhSRUUuT2JqZWN0M0Qpe1xyXG5cdFx0XHRcdFx0cm9vdCA9IG1vZHVsZTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0ZWxzZVxyXG5cdFx0XHRcdHtcclxuXHRcdFx0XHRcdHJvb3QgPSBuZXcgVEhSRUUuT2JqZWN0M0QoKTtcclxuXHJcblx0XHRcdFx0XHQvLyBoYW5kbGUgYWJzb2x1dGUgcG9zaXRpb25pbmdcclxuXHRcdFx0XHRcdGlmKG1vZHVsZS50cmFuc2Zvcm0pe1xyXG5cdFx0XHRcdFx0XHRyb290Lm1hdHJpeC5mcm9tQXJyYXkobW9kdWxlLnRyYW5zZm9ybSk7XHJcblx0XHRcdFx0XHRcdHJvb3QubWF0cml4LmRlY29tcG9zZShyb290LnBvc2l0aW9uLCByb290LnF1YXRlcm5pb24sIHJvb3Quc2NhbGUpO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0XHRcdGlmKG1vZHVsZS5wb3NpdGlvbil7XHJcblx0XHRcdFx0XHRcdFx0cm9vdC5wb3NpdGlvbi5mcm9tQXJyYXkobW9kdWxlLnBvc2l0aW9uKTtcclxuXHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHRpZihtb2R1bGUucm90YXRpb24pe1xyXG5cdFx0XHRcdFx0XHRcdHJvb3Qucm90YXRpb24uZnJvbUFycmF5KG1vZHVsZS5yb3RhdGlvbik7XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdC8vIGhhbmRsZSByZWxhdGl2ZSBwb3NpdGlvbmluZ1xyXG5cdFx0XHRcdGlmKG1vZHVsZS52ZXJ0aWNhbEFsaWduKXtcclxuXHRcdFx0XHRcdGxldCBoYWxmSGVpZ2h0ID0gc2VsZi5lbnYuaW5uZXJIZWlnaHQvKDIqc2VsZi5lbnYucGl4ZWxzUGVyTWV0ZXIpO1xyXG5cdFx0XHRcdFx0c3dpdGNoKG1vZHVsZS52ZXJ0aWNhbEFsaWduKXtcclxuXHRcdFx0XHRcdGNhc2UgJ3RvcCc6XHJcblx0XHRcdFx0XHRcdHJvb3QudHJhbnNsYXRlWShoYWxmSGVpZ2h0KTtcclxuXHRcdFx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdFx0XHRjYXNlICdib3R0b20nOlxyXG5cdFx0XHRcdFx0XHRyb290LnRyYW5zbGF0ZVkoLWhhbGZIZWlnaHQpO1xyXG5cdFx0XHRcdFx0XHRicmVhaztcclxuXHRcdFx0XHRcdGNhc2UgJ21pZGRsZSc6XHJcblx0XHRcdFx0XHRcdC8vIGRlZmF1bHRcclxuXHRcdFx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdFx0XHRkZWZhdWx0OlxyXG5cdFx0XHRcdFx0XHRjb25zb2xlLndhcm4oJ0ludmFsaWQgdmFsdWUgZm9yIFwidmVydGljYWxBbGlnblwiIC0gJywgbW9kdWxlLnZlcnRpY2FsQWxpZ24pO1xyXG5cdFx0XHRcdFx0XHRicmVhaztcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdHNlbGYuc2NlbmUuYWRkKHJvb3QpO1xyXG5cclxuXHRcdFx0XHRpZihzZWxmLnByZXZpZXdDYW1lcmEpe1xyXG5cdFx0XHRcdFx0bGV0IGF4aXMgPSBuZXcgVEhSRUUuQXhpc0hlbHBlcigxKTtcclxuXHRcdFx0XHRcdGF4aXMudXNlckRhdGEuYWx0c3BhY2UgPSB7Y29sbGlkZXI6IHtlbmFibGVkOiBmYWxzZX19O1xyXG5cdFx0XHRcdFx0cm9vdC5hZGQoYXhpcyk7XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRzZWxmLmxvYWRBc3NldHMobW9kdWxlLmFzc2V0cywgc2luZ2xldG9ucykudGhlbigocmVzdWx0cykgPT4ge1xyXG5cdFx0XHRcdFx0bW9kdWxlLmluaXRpYWxpemUoc2VsZi5lbnYsIHJvb3QsIHJlc3VsdHMpO1xyXG5cdFx0XHRcdH0pO1xyXG5cdFx0XHR9KTtcclxuXHRcdH0pO1xyXG5cclxuXHRcdC8vIHN0YXJ0IGFuaW1hdGluZ1xyXG5cdFx0d2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZShmdW5jdGlvbiBhbmltYXRlKHRpbWVzdGFtcClcclxuXHRcdHtcclxuXHRcdFx0d2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZShhbmltYXRlKTtcclxuXHRcdFx0c2VsZi5zY2VuZS51cGRhdGVBbGxCZWhhdmlvcnMoKTtcclxuXHRcdFx0aWYod2luZG93LlRXRUVOKSBUV0VFTi51cGRhdGUoKTtcclxuXHRcdFx0c2VsZi5yZW5kZXJlci5yZW5kZXIoc2VsZi5zY2VuZSwgc2VsZi5wcmV2aWV3Q2FtZXJhKTtcclxuXHRcdH0pO1xyXG5cdH1cclxuXHJcblx0bG9hZEFzc2V0cyhtYW5pZmVzdCwgc2luZ2xldG9ucylcclxuXHR7XHJcblx0XHR2YXIgc2VsZiA9IHRoaXM7XHJcblxyXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XHJcblx0XHR7XHJcblx0XHRcdC8vIHBvcHVsYXRlIGNhY2hlXHJcblx0XHRcdFByb21pc2UuYWxsKFtcclxuXHJcblx0XHRcdFx0Ly8gcG9wdWxhdGUgbW9kZWwgY2FjaGVcclxuXHRcdFx0XHQuLi5PYmplY3Qua2V5cyhtYW5pZmVzdC5tb2RlbHMgfHwge30pLm1hcChpZCA9PiBMb2FkZXJzLk1vZGVsUHJvbWlzZShtYW5pZmVzdC5tb2RlbHNbaWRdKSksXHJcblxyXG5cdFx0XHRcdC8vIHBvcHVsYXRlIGV4cGxpY2l0IHRleHR1cmUgY2FjaGVcclxuXHRcdFx0XHQuLi5PYmplY3Qua2V5cyhtYW5pZmVzdC50ZXh0dXJlcyB8fCB7fSkubWFwKGlkID0+IExvYWRlcnMuVGV4dHVyZVByb21pc2UobWFuaWZlc3QudGV4dHVyZXNbaWRdKSksXHJcblxyXG5cdFx0XHRcdC8vIGdlbmVyYXRlIGFsbCBwb3N0ZXJzXHJcblx0XHRcdFx0Li4uT2JqZWN0LmtleXMobWFuaWZlc3QucG9zdGVycyB8fCB7fSkubWFwKGlkID0+IExvYWRlcnMuUG9zdGVyUHJvbWlzZShtYW5pZmVzdC5wb3N0ZXJzW2lkXSkpXHJcblx0XHRcdF0pXHJcblxyXG5cdFx0XHQudGhlbigoKSA9PlxyXG5cdFx0XHR7XHJcblx0XHRcdFx0Ly8gcG9wdWxhdGUgcGF5bG9hZCBmcm9tIGNhY2hlXHJcblx0XHRcdFx0dmFyIHBheWxvYWQgPSB7bW9kZWxzOiB7fSwgdGV4dHVyZXM6IHt9LCBwb3N0ZXJzOiB7fX07XHJcblxyXG5cdFx0XHRcdGZvcihsZXQgaSBpbiBtYW5pZmVzdC5tb2RlbHMpe1xyXG5cdFx0XHRcdFx0bGV0IHVybCA9IG1hbmlmZXN0Lm1vZGVsc1tpXTtcclxuXHRcdFx0XHRcdGxldCB0ID0gTG9hZGVycy5fY2FjaGUubW9kZWxzW3VybF07XHJcblx0XHRcdFx0XHRwYXlsb2FkLm1vZGVsc1tpXSA9IHQgPyBzaW5nbGV0b25zW3VybF0gPyB0IDogdC5jbG9uZSgpIDogbnVsbDtcclxuXHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdGZvcihsZXQgaSBpbiBtYW5pZmVzdC50ZXh0dXJlcyl7XHJcblx0XHRcdFx0XHRsZXQgdXJsID0gbWFuaWZlc3QudGV4dHVyZXNbaV07XHJcblx0XHRcdFx0XHRsZXQgdCA9IExvYWRlcnMuX2NhY2hlLnRleHR1cmVzW3VybF07XHJcblx0XHRcdFx0XHRwYXlsb2FkLnRleHR1cmVzW2ldID0gdCA/IHNpbmdsZXRvbnNbdXJsXSA/IHQgOiB0LmNsb25lKCkgOiBudWxsO1xyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0Zm9yKGxldCBpIGluIG1hbmlmZXN0LnBvc3RlcnMpe1xyXG5cdFx0XHRcdFx0bGV0IHVybCA9IG1hbmlmZXN0LnBvc3RlcnNbaV07XHJcblx0XHRcdFx0XHRsZXQgdCA9IExvYWRlcnMuX2NhY2hlLnBvc3RlcnNbdXJsXTtcclxuXHRcdFx0XHRcdHBheWxvYWQucG9zdGVyc1tpXSA9IHQgPyBzaW5nbGV0b25zW3VybF0gPyB0IDogdC5jbG9uZSgpIDogbnVsbDtcclxuXHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdHJlc29sdmUocGF5bG9hZCk7XHJcblx0XHRcdH0pXHJcblx0XHRcdC5jYXRjaChlID0+IGNvbnNvbGUuZXJyb3IoZS5zdGFjaykpO1xyXG5cdFx0fSk7XHJcblx0fVxyXG5cclxufTtcclxuIl0sIm5hbWVzIjpbImxldCIsImxvYWRlciIsInN1cGVyIiwicmlnaHQiLCJMb2FkZXJzLl9jYWNoZSIsIkxvYWRlcnMuTW9kZWxQcm9taXNlIiwiTG9hZGVycy5UZXh0dXJlUHJvbWlzZSIsIkxvYWRlcnMuUG9zdGVyUHJvbWlzZSIsImkiLCJ1cmwiLCJ0Il0sIm1hcHBpbmdzIjoiOzs7QUFFQUEsSUFBSSxrQkFBa0IsR0FBRyxLQUFLLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUM7O0FBRTVELFNBQVMsVUFBVSxFQUFFLEdBQUcsRUFBRSxPQUFPO0FBQ2pDO0NBQ0MsR0FBRyxJQUFJLENBQUMsU0FBUyxFQUFFLEVBQUEsT0FBTyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQyxFQUFBOzs7Q0FHdEUsSUFBSSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRTtFQUM1RCxJQUFJLEdBQUcsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEVBQUU7R0FDeEIsR0FBRyxHQUFHLFFBQVEsQ0FBQyxNQUFNLEdBQUcsR0FBRyxDQUFDO0dBQzVCO09BQ0k7R0FDSixJQUFJLFFBQVEsR0FBRyxRQUFRLENBQUMsUUFBUSxDQUFDO0dBQ2pDLElBQUks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
