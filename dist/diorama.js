var Diorama = (function () {
'use strict';

var ModelPromise = (function (Promise) {
	function ModelPromise(url){
		Promise.call(this, function (resolve, reject) {
			// NOTE: glTF loader does not catch errors
			if(/\.gltf$/i.test(url)){
				if(THREE.glTFLoader){
					var loader = new THREE.glTFLoader();
					loader.load(url, function (result) {
						resolve(result.scene.children[0].children[0]);
					});
				}
				else {
					console.error(("THREE.glTFLoader not found. \"" + url + "\" not loaded."));
					reject();
				}
			}
			else if(/\.dae$/i.test(url)){
				if(THREE.ColladaLoader){
					var loader$1 = new THREE.ColladaLoader();
					loader$1.load(url, function (result) { return resolve(result.scene.children[0]); }, null, reject);
				}
				else {
					console.error(("THREE.ColladaLoader not found. \"" + url + "\" not loaded."));
					reject();
				}
			}
		});
	}

	if ( Promise ) ModelPromise.__proto__ = Promise;
	ModelPromise.prototype = Object.create( Promise && Promise.prototype );
	ModelPromise.prototype.constructor = ModelPromise;

	return ModelPromise;
}(Promise));

var TexturePromise = (function (Promise) {
	function TexturePromise(url){
		Promise.call(this, function (resolve, reject) {
			var loader = new THREE.TextureLoader();
			loader.load(url, resolve, null, reject);
		});
	}

	if ( Promise ) TexturePromise.__proto__ = Promise;
	TexturePromise.prototype = Object.create( Promise && Promise.prototype );
	TexturePromise.prototype.constructor = TexturePromise;

	return TexturePromise;
}(Promise));

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
	var gridOffset = ref.gridOffset; if ( gridOffset === void 0 ) gridOffset = new THREE.Vector3();

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
		.then(function(ref){
			var e = ref[0];
			var s = ref[1];

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
};
		
		
Diorama.prototype.start = function start ()
{
		var modules = [], len = arguments.length;
		while ( len-- ) modules[ len ] = arguments[ len ];

	var self = this;

	// make sure space info is filled out before initialization
	if(!self.env){
		return self._envPromise.then(function () { self.start.apply(self, modules); });
	}

	// determine which assets aren't shared
	var singletons = {};
	modules.forEach(function (mod) {
		function checkAsset(url){
			if(singletons[url] === undefined) { singletons[url] = true; }
			else if(singletons[url] === true) { singletons[url] = false; }
		}
		Object.keys(mod.assets.textures || {}).map(function (k) { return mod.assets.textures[k]; }).forEach(checkAsset);
		Object.keys(mod.assets.models || {}).map(function (k) { return mod.assets.models[k]; }).forEach(checkAsset);
	});

	// determine if the tracking skeleton is needed
	var needsSkeleton = modules.reduce(function (ns,m) { return ns || m.needsSkeleton; }, false);
	if(needsSkeleton && altspace.inClient){
		altspace.getThreeJSTrackingSkeleton().then(function (skel) {
			self.scene.add(skel);
			self.env.skel = skel;
		});
	}

	// construct dioramas
	modules.forEach(function(module)
	{
		var root = null;
			
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
			root.add( new THREE.AxisHelper(1) );
		}
		
		self.loadAssets(module.assets, singletons).then(function (results) {
			module.initialize(self.env, root, results);
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

	var PromisesFinished = (function (Promise) {
			function PromisesFinished(arr){
			Promise.call(this, function (resolve, reject) {
				var waiting = arr.length;
				
				function checkDone(){
					if(--waiting === 0)
						{ resolve(); }
				}

				arr.forEach(function (p) { p.then(checkDone, checkDone); });
			});
		}

			if ( Promise ) PromisesFinished.__proto__ = Promise;
			PromisesFinished.prototype = Object.create( Promise && Promise.prototype );
			PromisesFinished.prototype.constructor = PromisesFinished;

			return PromisesFinished;
		}(Promise));

	return new Promise(function (resolve, reject) {
		// populate cache
		PromisesFinished([

			// populate model cache
			Promise.all(Object.keys(manifest.models || {}).map(function (id) {
				var url = manifest.models[id];
				if(self.assetCache.models[url])
					{ return Promise.resolve(self.assetCache.models[url]); }
				else
					{ return ModelPromise(url).then(function (model) {
						self.assetCache.models[url] = model;
					}); }
			})),

			// populate explicit texture cache
			Promise.all(Object.keys(manifest.textures || {}).map(function (id) {
				var url = manifest.textures[id];
				if(self.assetCache.textures[url])
					{ return Promise.resolve(self.assetCache.textures[url]); }
				else
					{ return TexturePromise(url).then(function (texture) {
						self.assetCache.textures[url] = texture;
					}); }			
			}))
		])

		.then(function () {
			// populate payload from cache
			var payload = {models: {}, textures: {}};

			for(var i in manifest.models){
				var url = manifest.models[i];
				var t = self.assetCache.models[url];
				payload.models[i] = t ? singletons[url] ? t : t.clone() : null;
			}

			for(var i$1 in manifest.textures){
				var url$1 = manifest.textures[i$1];
				var t$1 = self.assetCache.textures[url$1];
				payload.textures[i$1] = t$1 ? singletons[url$1] ? t$1 : t$1.clone() : null;
			}

			resolve(payload);
		});
	});
};

return Diorama;

}());
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjpudWxsLCJzb3VyY2VzIjpbIi4uL3NyYy9sb2FkZXJzLmpzIiwiLi4vc3JjL2NhbWVyYS5qcyIsIi4uL3NyYy9tYWluLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcblxuY2xhc3MgTW9kZWxQcm9taXNlIGV4dGVuZHMgUHJvbWlzZSB7XG5cdGNvbnN0cnVjdG9yKHVybCl7XG5cdFx0c3VwZXIoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Ly8gTk9URTogZ2xURiBsb2FkZXIgZG9lcyBub3QgY2F0Y2ggZXJyb3JzXG5cdFx0XHRpZigvXFwuZ2x0ZiQvaS50ZXN0KHVybCkpe1xuXHRcdFx0XHRpZihUSFJFRS5nbFRGTG9hZGVyKXtcblx0XHRcdFx0XHRsZXQgbG9hZGVyID0gbmV3IFRIUkVFLmdsVEZMb2FkZXIoKTtcblx0XHRcdFx0XHRsb2FkZXIubG9hZCh1cmwsIChyZXN1bHQpID0+IHtcblx0XHRcdFx0XHRcdHJlc29sdmUocmVzdWx0LnNjZW5lLmNoaWxkcmVuWzBdLmNoaWxkcmVuWzBdKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRjb25zb2xlLmVycm9yKGBUSFJFRS5nbFRGTG9hZGVyIG5vdCBmb3VuZC4gXCIke3VybH1cIiBub3QgbG9hZGVkLmApO1xuXHRcdFx0XHRcdHJlamVjdCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmKC9cXC5kYWUkL2kudGVzdCh1cmwpKXtcblx0XHRcdFx0aWYoVEhSRUUuQ29sbGFkYUxvYWRlcil7XG5cdFx0XHRcdFx0bGV0IGxvYWRlciA9IG5ldyBUSFJFRS5Db2xsYWRhTG9hZGVyKCk7XG5cdFx0XHRcdFx0bG9hZGVyLmxvYWQodXJsLCByZXN1bHQgPT4gcmVzb2x2ZShyZXN1bHQuc2NlbmUuY2hpbGRyZW5bMF0pLCBudWxsLCByZWplY3QpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoYFRIUkVFLkNvbGxhZGFMb2FkZXIgbm90IGZvdW5kLiBcIiR7dXJsfVwiIG5vdCBsb2FkZWQuYCk7XG5cdFx0XHRcdFx0cmVqZWN0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBUZXh0dXJlUHJvbWlzZSBleHRlbmRzIFByb21pc2Uge1xuXHRjb25zdHJ1Y3Rvcih1cmwpe1xuXHRcdHN1cGVyKChyZXNvbHZlLCByZWplY3QpID0+XG5cdFx0e1xuXHRcdFx0dmFyIGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKCk7XG5cdFx0XHRsb2FkZXIubG9hZCh1cmwsIHJlc29sdmUsIG51bGwsIHJlamVjdCk7XG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgVmlkZW9Qcm9taXNlIGV4dGVuZHMgUHJvbWlzZSB7XG5cdGNvbnN0cnVjdG9yKHVybClcblx0e1xuXHRcdC8vIHN0YXJ0IGxvYWRlclxuXHRcdHZhciB2aWRTcmMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd2aWRlbycpO1xuXHRcdHZpZFNyYy5hdXRvcGxheSA9IHRydWU7XG5cdFx0dmlkU3JjLmxvb3AgPSB0cnVlO1xuXHRcdHZpZFNyYy5zcmMgPSB1cmw7XG5cdFx0dmlkU3JjLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh2aWRTcmMpO1xuXG5cdFx0dmFyIHRleCA9IG5ldyBUSFJFRS5WaWRlb1RleHR1cmUodmlkU3JjKTtcblx0XHR0ZXgubWluRmlsdGVyID0gVEhSRUUuTGluZWFyRmlsdGVyO1xuXHRcdHRleC5tYWdGaWx0ZXIgPSBUSFJFRS5MaW5lYXJGaWx0ZXI7XG5cdFx0dGV4LmZvcm1hdCA9IFRIUkVFLlJHQkZvcm1hdDtcblxuXHRcdC8vY2FjaGUudmlkZW9zW3VybF0gPSB0ZXg7XG5cdFx0Ly9wYXlsb2FkLnZpZGVvc1tpZF0gPSBjYWNoZS52aWRlb3NbdXJsXTtcblxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGV4KTtcblx0fVxufVxuXG5jbGFzcyBQb3N0ZXJQcm9taXNlIGV4dGVuZHMgUHJvbWlzZSB7XG5cdGNvbnN0cnVjdG9yKHVybCl7XG5cdFx0c3VwZXIoKHJlc29sdmUsIHJlamVjdCkgPT4gXG5cdFx0e1xuXHRcdFx0ZnVuY3Rpb24gb25sb2FkKGltZylcblx0XHRcdHtcblx0XHRcdFx0bGV0IHdpZHRoID0gaW1nLndpZHRoLCBoZWlnaHQgPSBpbWcuaGVpZ2h0LCByYXRpbyA9IGltZy53aWR0aC9pbWcuaGVpZ2h0O1xuXHRcdFx0XHRcblx0XHRcdFx0bGV0IHRleCA9IG5ldyBUSFJFRS5UZXh0dXJlKGltZyk7XG5cdFx0XHRcdGxldCBtYXQgPSBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoe21hcDogdGV4LCBzaWRlOiBUSFJFRS5Eb3VibGVTaWRlfSk7XG5cdFx0XHRcdGxldCBnZW8gPSBuZXcgVEhSRUUuUGxhbmVHZW9tZXRyeSguLi4ocmF0aW8gPiAxID8gWzEsIDEvcmF0aW9dIDogW3JhdGlvLCAxXSkpO1xuXHRcdFx0XHRsZXQgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlbywgbWF0KTtcblx0XHRcdFx0XG5cdFx0XHRcdHJlc29sdmUobWVzaCk7XG5cdFx0XHR9XG5cdFx0XHRcblx0XHRcdGZ1bmN0aW9uIG9uZXJyb3IoZSl7XG5cdFx0XHRcdHJlamVjdChlKTtcblx0XHRcdH1cblx0XHRcdFxuXHRcdFx0bGV0IGxvYWRlciA9IG5ldyBUSFJFRS5JbWFnZUxvYWRlcigpO1xuXHRcdFx0bG9hZGVyLmxvYWQodXJsLCBvbmxvYWQsIG51bGwsIG9uZXJyb3IpO1xuXHRcdFx0XG5cdFx0XHRcblx0XHRcdFxuXHRcdFx0LypmdW5jdGlvbiBnZW5lcmF0ZVBvc3Rlcih0ZXh0dXJlLCB3aWR0aCwgaGVpZ2h0KVxuXHRcdFx0e1xuXHRcdFx0XHR2YXIgcCA9IHRlbXBsYXRlLmNsb25lKCk7XG5cdFx0XHRcdHAubWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoe21hcDogdGV4dHVyZX0pO1xuXHRcdFx0XHRwLm1hdGVyaWFsLnNpZGUgPSBUSFJFRS5Eb3VibGVTaWRlO1xuXHRcdFx0XHRcblx0XHRcdFx0cC5zY2FsZS5zZXQod2lkdGgsIGhlaWdodCwgMSk7XG5cblx0XHRcdFx0dmFyIHJhdGlvID0gd2lkdGgvaGVpZ2h0O1xuXHRcdFx0XHRpZihyYXRpbyA+IDEpe1xuXHRcdFx0XHRcdHRleHR1cmUucmVwZWF0LnNldCgxLCAxL3JhdGlvKTtcblx0XHRcdFx0XHR0ZXh0dXJlLm9mZnNldC5zZXQoMCwgMS0xL3JhdGlvKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHR0ZXh0dXJlLnJlcGVhdC5zZXQoMS9yYXRpbywgMSk7XG5cdFx0XHRcdFx0dGV4dHVyZS5vZmZzZXQuc2V0KDAsIDApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHA7XG5cdFx0XHR9Ki9cblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgeyBNb2RlbFByb21pc2UsIFRleHR1cmVQcm9taXNlLCBWaWRlb1Byb21pc2UsIFBvc3RlclByb21pc2UgfTtcblxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBQcmV2aWV3Q2FtZXJhIGV4dGVuZHMgVEhSRUUuT3J0aG9ncmFwaGljQ2FtZXJhXG57XG5cdGNvbnN0cnVjdG9yKGZvY3VzLCB2aWV3U2l6ZSwgbG9va0RpcmVjdGlvbilcblx0e1xuXHRcdHN1cGVyKC0xLCAxLCAxLCAtMSwgLjEsIDQwMCk7XG5cblx0XHRsZXQgc2V0dGluZ3MgPSB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2Rpb3JhbWFWaWV3U2V0dGluZ3MnKTtcblx0XHRpZihzZXR0aW5ncyl7XG5cdFx0XHRzZXR0aW5ncyA9IEpTT04ucGFyc2Uoc2V0dGluZ3MpO1xuXHRcdFx0aWYoIWZvY3VzKVxuXHRcdFx0XHRmb2N1cyA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuZnJvbUFycmF5KHNldHRpbmdzLmZvY3VzKTtcblx0XHRcdGlmKCF2aWV3U2l6ZSlcblx0XHRcdFx0dmlld1NpemUgPSBzZXR0aW5ncy52aWV3U2l6ZTtcblx0XHRcdGlmKCFsb29rRGlyZWN0aW9uKVxuXHRcdFx0XHRsb29rRGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5mcm9tQXJyYXkoc2V0dGluZ3MubG9va0RpcmVjdGlvbik7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdmlld1NpemUgPSB2aWV3U2l6ZSB8fCA0MDtcblx0XHR0aGlzLl9mb2N1cyA9IGZvY3VzIHx8IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG5cdFx0dGhpcy5fbG9va0RpcmVjdGlvbiA9IGxvb2tEaXJlY3Rpb24gfHwgbmV3IFRIUkVFLlZlY3RvcjMoMCwtMSwwKTtcblx0XHR0aGlzLmdyaWRIZWxwZXIgPSBuZXcgVEhSRUUuR3JpZEhlbHBlcigzMDAsIDEpO1xuXHRcdC8vdGhpcy5ncmlkSGVscGVyLnF1YXRlcm5pb24uc2V0RnJvbVVuaXRWZWN0b3JzKCBuZXcgVEhSRUUuVmVjdG9yMygwLC0xLDApLCB0aGlzLl9sb29rRGlyZWN0aW9uICk7XG5cdH1cblxuXHRnZXQgdmlld1NpemUoKXtcblx0XHRyZXR1cm4gdGhpcy5fdmlld1NpemU7XG5cdH1cblx0c2V0IHZpZXdTaXplKHZhbCl7XG5cdFx0dGhpcy5fdmlld1NpemUgPSB2YWw7XG5cdFx0dGhpcy5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXHR9XG5cblx0Z2V0IGZvY3VzKCl7XG5cdFx0cmV0dXJuIHRoaXMuX2ZvY3VzO1xuXHR9XG5cdHNldCBmb2N1cyh2YWwpe1xuXHRcdHRoaXMuX2ZvY3VzLmNvcHkodmFsKTtcblx0XHR0aGlzLnJlY29tcHV0ZVZpZXdwb3J0KCk7XG5cdH1cblxuXHRnZXQgbG9va0RpcmVjdGlvbigpe1xuXHRcdHJldHVybiB0aGlzLl9sb29rRGlyZWN0aW9uO1xuXHR9XG5cdHNldCBsb29rRGlyZWN0aW9uKHZhbCl7XG5cdFx0dGhpcy5fbG9va0RpcmVjdGlvbi5jb3B5KHZhbCk7XG5cdFx0dGhpcy5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXHR9XG5cblx0cmVnaXN0ZXJIb29rcyhyZW5kZXJlcilcblx0e1xuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRzZWxmLnJlbmRlcmVyID0gcmVuZGVyZXI7XG5cblx0XHQvLyBzZXQgc3R5bGVzIG9uIHRoZSBwYWdlLCBzbyB0aGUgcHJldmlldyB3b3JrcyByaWdodFxuXHRcdGRvY3VtZW50LmJvZHkucGFyZW50RWxlbWVudC5zdHlsZS5oZWlnaHQgPSAnMTAwJSc7XG5cdFx0ZG9jdW1lbnQuYm9keS5zdHlsZS5oZWlnaHQgPSAnMTAwJSc7XG5cdFx0ZG9jdW1lbnQuYm9keS5zdHlsZS5tYXJnaW4gPSAnMCc7XG5cdFx0ZG9jdW1lbnQuYm9keS5zdHlsZS5vdmVyZmxvdyA9ICdoaWRkZW4nO1xuXG5cdFx0dmFyIGluZm8gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJyk7XG5cdFx0aW5mby5pbm5lckhUTUwgPSBbJ01pZGRsZSBjbGljayBhbmQgZHJhZyB0byBwYW4nLCAnTW91c2Ugd2hlZWwgdG8gem9vbScsICdBcnJvdyBrZXlzIHRvIHJvdGF0ZSddLmpvaW4oJzxici8+Jyk7XG5cdFx0T2JqZWN0LmFzc2lnbihpbmZvLnN0eWxlLCB7XG5cdFx0XHRwb3NpdGlvbjogJ2ZpeGVkJyxcblx0XHRcdHRvcDogJzEwcHgnLFxuXHRcdFx0bGVmdDogJzEwcHgnLFxuXHRcdFx0bWFyZ2luOiAwXG5cdFx0fSk7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChpbmZvKTtcblxuXHRcdC8vIHJlc2l6ZSB0aGUgcHJldmlldyBjYW52YXMgd2hlbiB3aW5kb3cgcmVzaXplc1xuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCBlID0+IHNlbGYucmVjb21wdXRlVmlld3BvcnQoKSk7XG5cdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXG5cdFx0Ly8gbWlkZGxlIGNsaWNrIGFuZCBkcmFnIHRvIHBhbiB2aWV3XG5cdFx0dmFyIGRyYWdTdGFydCA9IG51bGwsIGZvY3VzU3RhcnQgPSBudWxsO1xuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBlID0+IHtcblx0XHRcdGlmKGUuYnV0dG9uID09PSAxKXtcblx0XHRcdFx0ZHJhZ1N0YXJ0ID0ge3g6IGUuY2xpZW50WCwgeTogZS5jbGllbnRZfTtcblx0XHRcdFx0Zm9jdXNTdGFydCA9IHNlbGYuX2ZvY3VzLmNsb25lKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCBlID0+IHtcblx0XHRcdGlmKGUuYnV0dG9uID09PSAxKXtcblx0XHRcdFx0ZHJhZ1N0YXJ0ID0gbnVsbDtcblx0XHRcdFx0Zm9jdXNTdGFydCA9IG51bGw7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIGUgPT4ge1xuXHRcdFx0aWYoZHJhZ1N0YXJ0KVxuXHRcdFx0e1xuXHRcdFx0XHRsZXQge2NsaWVudFdpZHRoOiB3LCBjbGllbnRIZWlnaHQ6IGh9ID0gZG9jdW1lbnQuYm9keTtcblx0XHRcdFx0bGV0IHBpeGVsc1Blck1ldGVyID0gTWF0aC5zcXJ0KHcqdytoKmgpIC8gc2VsZi5fdmlld1NpemU7XG5cdFx0XHRcdGxldCBkeCA9IGUuY2xpZW50WCAtIGRyYWdTdGFydC54LCBkeSA9IGUuY2xpZW50WSAtIGRyYWdTdGFydC55O1xuXHRcdFx0XHRsZXQgcmlnaHQgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmNyb3NzVmVjdG9ycyhzZWxmLl9sb29rRGlyZWN0aW9uLCBzZWxmLnVwKTtcblxuXHRcdFx0XHRzZWxmLl9mb2N1cy5jb3B5KGZvY3VzU3RhcnQpXG5cdFx0XHRcdFx0LmFkZChzZWxmLnVwLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoZHkvcGl4ZWxzUGVyTWV0ZXIpKVxuXHRcdFx0XHRcdC5hZGQocmlnaHQubXVsdGlwbHlTY2FsYXIoLWR4L3BpeGVsc1Blck1ldGVyKSk7XG5cblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gd2hlZWwgdG8gem9vbVxuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCd3aGVlbCcsIGUgPT4ge1xuXHRcdFx0aWYoZS5kZWx0YVkgPCAwKXtcblx0XHRcdFx0c2VsZi5fdmlld1NpemUgKj0gMC45MDtcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZihlLmRlbHRhWSA+IDApe1xuXHRcdFx0XHRzZWxmLl92aWV3U2l6ZSAqPSAxLjE7XG5cdFx0XHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIGFycm93IGtleXMgdG8gcm90YXRlXG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBlID0+IHtcblx0XHRcdGlmKGUua2V5ID09PSAnQXJyb3dEb3duJyl7XG5cdFx0XHRcdGxldCByaWdodCA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuY3Jvc3NWZWN0b3JzKHNlbGYuX2xvb2tEaXJlY3Rpb24sIHNlbGYudXApO1xuXHRcdFx0XHRzZWxmLl9sb29rRGlyZWN0aW9uLmFwcGx5QXhpc0FuZ2xlKHJpZ2h0LCBNYXRoLlBJLzIpO1xuXHRcdFx0XHQvL3NlbGYuZ3JpZEhlbHBlci5yb3RhdGVPbkF4aXMocmlnaHQsIE1hdGguUEkvMik7XG5cdFx0XHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcblx0XHRcdH1cblx0XHRcdGVsc2UgaWYoZS5rZXkgPT09ICdBcnJvd1VwJyl7XG5cdFx0XHRcdGxldCByaWdodCA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuY3Jvc3NWZWN0b3JzKHNlbGYuX2xvb2tEaXJlY3Rpb24sIHNlbGYudXApO1xuXHRcdFx0XHRzZWxmLl9sb29rRGlyZWN0aW9uLmFwcGx5QXhpc0FuZ2xlKHJpZ2h0LCAtTWF0aC5QSS8yKTtcblx0XHRcdFx0Ly9zZWxmLmdyaWRIZWxwZXIucm90YXRlT25BeGlzKHJpZ2h0LCAtTWF0aC5QSS8yKTtcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmKGUua2V5ID09PSAnQXJyb3dMZWZ0Jyl7XG5cdFx0XHRcdHNlbGYuX2xvb2tEaXJlY3Rpb24uYXBwbHlBeGlzQW5nbGUoc2VsZi51cCwgLU1hdGguUEkvMik7XG5cdFx0XHRcdC8vc2VsZi5ncmlkSGVscGVyLnJvdGF0ZU9uQXhpcyhzZWxmLnVwLCAtTWF0aC5QSS8yKTtcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZihlLmtleSA9PT0gJ0Fycm93UmlnaHQnKXtcblx0XHRcdFx0c2VsZi5fbG9va0RpcmVjdGlvbi5hcHBseUF4aXNBbmdsZShzZWxmLnVwLCBNYXRoLlBJLzIpO1xuXHRcdFx0XHQvL3NlbGYuZ3JpZEhlbHBlci5yb3RhdGVPbkF4aXMoc2VsZi51cCwgTWF0aC5QSS8yKTtcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cmVjb21wdXRlVmlld3BvcnQoKVxuXHR7XG5cdFx0dmFyIHtjbGllbnRXaWR0aDogdywgY2xpZW50SGVpZ2h0OiBofSA9IGRvY3VtZW50LmJvZHk7XG5cblx0XHQvLyByZXNpemUgY2FudmFzXG5cdFx0dGhpcy5yZW5kZXJlci5zZXRTaXplKHcsIGgpO1xuXG5cdFx0Ly8gY29tcHV0ZSB3aW5kb3cgZGltZW5zaW9ucyBmcm9tIHZpZXcgc2l6ZVxuXHRcdHZhciByYXRpbyA9IHcvaDtcblx0XHR2YXIgaGVpZ2h0ID0gTWF0aC5zcXJ0KCAodGhpcy5fdmlld1NpemUqdGhpcy5fdmlld1NpemUpIC8gKHJhdGlvKnJhdGlvICsgMSkgKTtcblx0XHR2YXIgd2lkdGggPSByYXRpbyAqIGhlaWdodDtcblxuXHRcdC8vIHNldCBmcnVzdHJ1bSBlZGdlc1xuXHRcdHRoaXMubGVmdCA9IC13aWR0aC8yO1xuXHRcdHRoaXMucmlnaHQgPSB3aWR0aC8yO1xuXHRcdHRoaXMudG9wID0gaGVpZ2h0LzI7XG5cdFx0dGhpcy5ib3R0b20gPSAtaGVpZ2h0LzI7XG5cblx0XHR0aGlzLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcblxuXHRcdC8vIHVwZGF0ZSBwb3NpdGlvblxuXHRcdHRoaXMucG9zaXRpb24uY29weSh0aGlzLl9mb2N1cykuc3ViKCB0aGlzLl9sb29rRGlyZWN0aW9uLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoMjAwKSApO1xuXHRcdGlmKCBNYXRoLmFicyggdGhpcy5fbG9va0RpcmVjdGlvbi5ub3JtYWxpemUoKS5kb3QobmV3IFRIUkVFLlZlY3RvcjMoMCwtMSwwKSkgKSA9PT0gMSApXG5cdFx0XHR0aGlzLnVwLnNldCgwLDAsMSk7IC8vIGlmIHdlJ3JlIGxvb2tpbmcgZG93biB0aGUgWSBheGlzXG5cdFx0ZWxzZVxuXHRcdFx0dGhpcy51cC5zZXQoMCwxLDApO1xuXHRcdHRoaXMubG9va0F0KCB0aGlzLl9mb2N1cyApO1xuXG5cdFx0d2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKCdkaW9yYW1hVmlld1NldHRpbmdzJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0Zm9jdXM6IHRoaXMuX2ZvY3VzLnRvQXJyYXkoKSxcblx0XHRcdHZpZXdTaXplOiB0aGlzLl92aWV3U2l6ZSxcblx0XHRcdGxvb2tEaXJlY3Rpb246IHRoaXMuX2xvb2tEaXJlY3Rpb24udG9BcnJheSgpXG5cdFx0fSkpO1xuXHR9XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbmltcG9ydCAqIGFzIExvYWRlcnMgZnJvbSAnLi9sb2FkZXJzJztcbmltcG9ydCBQcmV2aWV3Q2FtZXJhIGZyb20gJy4vY2FtZXJhJztcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRGlvcmFtYVxue1xuXHRjb25zdHJ1Y3Rvcih7YmdDb2xvcj0weGFhYWFhYSwgZ3JpZE9mZnNldD1uZXcgVEhSRUUuVmVjdG9yMygpfSA9IHt9KVxuXHR7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdFx0c2VsZi5hc3NldENhY2hlID0ge1xuXHRcdFx0bW9kZWxzOiB7fSxcblx0XHRcdHRleHR1cmVzOiB7fSxcblx0XHRcdHZpZGVvczoge31cblx0XHR9O1xuXG5cdFx0c2VsZi5zY2VuZSA9IG5ldyBUSFJFRS5TY2VuZSgpO1xuXG5cdFx0Ly8gc2V0IHVwIHJlbmRlcmVyIGFuZCBzY2FsZVxuXHRcdGlmKGFsdHNwYWNlLmluQ2xpZW50KVxuXHRcdHtcblx0XHRcdHNlbGYucmVuZGVyZXIgPSBhbHRzcGFjZS5nZXRUaHJlZUpTUmVuZGVyZXIoKTtcblx0XHRcdHNlbGYuX2VudlByb21pc2UgPSBQcm9taXNlLmFsbChbYWx0c3BhY2UuZ2V0RW5jbG9zdXJlKCksIGFsdHNwYWNlLmdldFNwYWNlKCldKVxuXHRcdFx0LnRoZW4oZnVuY3Rpb24oW2UsIHNdKXtcblx0XHRcdFx0c2VsZi5lbnYgPSBPYmplY3QuZnJlZXplKE9iamVjdC5hc3NpZ24oe30sIGUsIHMpKTtcblx0XHRcdFx0c2VsZi5zY2VuZS5zY2FsZS5tdWx0aXBseVNjYWxhcihlLnBpeGVsc1Blck1ldGVyKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRlbHNlXG5cdFx0e1xuXHRcdFx0Ly8gc2V0IHVwIHByZXZpZXcgcmVuZGVyZXIsIGluIGNhc2Ugd2UncmUgb3V0IG9mIHdvcmxkXG5cdFx0XHRzZWxmLnJlbmRlcmVyID0gbmV3IFRIUkVFLldlYkdMUmVuZGVyZXIoKTtcblx0XHRcdHNlbGYucmVuZGVyZXIuc2V0U2l6ZShkb2N1bWVudC5ib2R5LmNsaWVudFdpZHRoLCBkb2N1bWVudC5ib2R5LmNsaWVudEhlaWdodCk7XG5cdFx0XHRzZWxmLnJlbmRlcmVyLnNldENsZWFyQ29sb3IoIGJnQ29sb3IgKTtcblx0XHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoc2VsZi5yZW5kZXJlci5kb21FbGVtZW50KTtcblx0XHRcblx0XHRcdHNlbGYucHJldmlld0NhbWVyYSA9IG5ldyBQcmV2aWV3Q2FtZXJhKCk7XG5cdFx0XHRzZWxmLnByZXZpZXdDYW1lcmEuZ3JpZEhlbHBlci5wb3NpdGlvbi5jb3B5KGdyaWRPZmZzZXQpO1xuXHRcdFx0c2VsZi5zY2VuZS5hZGQoc2VsZi5wcmV2aWV3Q2FtZXJhLCBzZWxmLnByZXZpZXdDYW1lcmEuZ3JpZEhlbHBlcik7XG5cdFx0XHRzZWxmLnByZXZpZXdDYW1lcmEucmVnaXN0ZXJIb29rcyhzZWxmLnJlbmRlcmVyKTtcblxuXHRcdFx0Ly8gc2V0IHVwIGN1cnNvciBlbXVsYXRpb25cblx0XHRcdGFsdHNwYWNlLnV0aWxpdGllcy5zaGltcy5jdXJzb3IuaW5pdChzZWxmLnNjZW5lLCBzZWxmLnByZXZpZXdDYW1lcmEsIHtyZW5kZXJlcjogc2VsZi5yZW5kZXJlcn0pO1xuXHRcdFxuXHRcdFx0Ly8gc3R1YiBlbnZpcm9ubWVudFxuXHRcdFx0c2VsZi5lbnYgPSBPYmplY3QuZnJlZXplKHtcblx0XHRcdFx0aW5uZXJXaWR0aDogMTAyNCxcblx0XHRcdFx0aW5uZXJIZWlnaHQ6IDEwMjQsXG5cdFx0XHRcdGlubmVyRGVwdGg6IDEwMjQsXG5cdFx0XHRcdHBpeGVsc1Blck1ldGVyOiAxMDI0LzMsXG5cdFx0XHRcdHNpZDogJ2Jyb3dzZXInLFxuXHRcdFx0XHRuYW1lOiAnYnJvd3NlcicsXG5cdFx0XHRcdHRlbXBsYXRlU2lkOiAnYnJvd3Nlcidcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXHRcdFxuXHRcdFxuXHRzdGFydCguLi5tb2R1bGVzKVxuXHR7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdFx0Ly8gbWFrZSBzdXJlIHNwYWNlIGluZm8gaXMgZmlsbGVkIG91dCBiZWZvcmUgaW5pdGlhbGl6YXRpb25cblx0XHRpZighc2VsZi5lbnYpe1xuXHRcdFx0cmV0dXJuIHNlbGYuX2VudlByb21pc2UudGhlbigoKSA9PiB7IHNlbGYuc3RhcnQoLi4ubW9kdWxlcyk7IH0pO1xuXHRcdH1cblxuXHRcdC8vIGRldGVybWluZSB3aGljaCBhc3NldHMgYXJlbid0IHNoYXJlZFxuXHRcdHZhciBzaW5nbGV0b25zID0ge307XG5cdFx0bW9kdWxlcy5mb3JFYWNoKG1vZCA9PlxuXHRcdHtcblx0XHRcdGZ1bmN0aW9uIGNoZWNrQXNzZXQodXJsKXtcblx0XHRcdFx0aWYoc2luZ2xldG9uc1t1cmxdID09PSB1bmRlZmluZWQpIHNpbmdsZXRvbnNbdXJsXSA9IHRydWU7XG5cdFx0XHRcdGVsc2UgaWYoc2luZ2xldG9uc1t1cmxdID09PSB0cnVlKSBzaW5nbGV0b25zW3VybF0gPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdE9iamVjdC5rZXlzKG1vZC5hc3NldHMudGV4dHVyZXMgfHwge30pLm1hcChrID0+IG1vZC5hc3NldHMudGV4dHVyZXNba10pLmZvckVhY2goY2hlY2tBc3NldCk7XG5cdFx0XHRPYmplY3Qua2V5cyhtb2QuYXNzZXRzLm1vZGVscyB8fCB7fSkubWFwKGsgPT4gbW9kLmFzc2V0cy5tb2RlbHNba10pLmZvckVhY2goY2hlY2tBc3NldCk7XG5cdFx0fSk7XG5cblx0XHQvLyBkZXRlcm1pbmUgaWYgdGhlIHRyYWNraW5nIHNrZWxldG9uIGlzIG5lZWRlZFxuXHRcdGxldCBuZWVkc1NrZWxldG9uID0gbW9kdWxlcy5yZWR1Y2UoKG5zLG0pID0+IG5zIHx8IG0ubmVlZHNTa2VsZXRvbiwgZmFsc2UpO1xuXHRcdGlmKG5lZWRzU2tlbGV0b24gJiYgYWx0c3BhY2UuaW5DbGllbnQpe1xuXHRcdFx0YWx0c3BhY2UuZ2V0VGhyZWVKU1RyYWNraW5nU2tlbGV0b24oKS50aGVuKHNrZWwgPT4ge1xuXHRcdFx0XHRzZWxmLnNjZW5lLmFkZChza2VsKTtcblx0XHRcdFx0c2VsZi5lbnYuc2tlbCA9IHNrZWw7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBjb25zdHJ1Y3QgZGlvcmFtYXNcblx0XHRtb2R1bGVzLmZvckVhY2goZnVuY3Rpb24obW9kdWxlKVxuXHRcdHtcblx0XHRcdGxldCByb290ID0gbnVsbDtcblx0XHRcdFxuXHRcdFx0aWYobW9kdWxlIGluc3RhbmNlb2YgVEhSRUUuT2JqZWN0M0QpXG5cdFx0XHR7XG5cdFx0XHRcdHJvb3QgPSBtb2R1bGU7XG5cdFx0XHR9XG5cdFx0XHRlbHNlXG5cdFx0XHR7XG5cdFx0XHRcdHJvb3QgPSBuZXcgVEhSRUUuT2JqZWN0M0QoKTtcblxuXHRcdFx0XHQvLyBoYW5kbGUgYWJzb2x1dGUgcG9zaXRpb25pbmdcblx0XHRcdFx0aWYobW9kdWxlLnRyYW5zZm9ybSl7XG5cdFx0XHRcdFx0cm9vdC5tYXRyaXguZnJvbUFycmF5KG1vZHVsZS50cmFuc2Zvcm0pO1xuXHRcdFx0XHRcdHJvb3QubWF0cml4LmRlY29tcG9zZShyb290LnBvc2l0aW9uLCByb290LnF1YXRlcm5pb24sIHJvb3Quc2NhbGUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdGlmKG1vZHVsZS5wb3NpdGlvbil7XG5cdFx0XHRcdFx0XHRyb290LnBvc2l0aW9uLmZyb21BcnJheShtb2R1bGUucG9zaXRpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZihtb2R1bGUucm90YXRpb24pe1xuXHRcdFx0XHRcdFx0cm9vdC5yb3RhdGlvbi5mcm9tQXJyYXkobW9kdWxlLnJvdGF0aW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gaGFuZGxlIHJlbGF0aXZlIHBvc2l0aW9uaW5nXG5cdFx0XHRpZihtb2R1bGUudmVydGljYWxBbGlnbil7XG5cdFx0XHRcdGxldCBoYWxmSGVpZ2h0ID0gc2VsZi5lbnYuaW5uZXJIZWlnaHQvKDIqc2VsZi5lbnYucGl4ZWxzUGVyTWV0ZXIpO1xuXHRcdFx0XHRzd2l0Y2gobW9kdWxlLnZlcnRpY2FsQWxpZ24pe1xuXHRcdFx0XHRjYXNlICd0b3AnOlxuXHRcdFx0XHRcdHJvb3QudHJhbnNsYXRlWShoYWxmSGVpZ2h0KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnYm90dG9tJzpcblx0XHRcdFx0XHRyb290LnRyYW5zbGF0ZVkoLWhhbGZIZWlnaHQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdtaWRkbGUnOlxuXHRcdFx0XHRcdC8vIGRlZmF1bHRcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRjb25zb2xlLndhcm4oJ0ludmFsaWQgdmFsdWUgZm9yIFwidmVydGljYWxBbGlnblwiIC0gJywgbW9kdWxlLnZlcnRpY2FsQWxpZ24pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHNlbGYuc2NlbmUuYWRkKHJvb3QpO1xuXG5cdFx0XHRpZihzZWxmLnByZXZpZXdDYW1lcmEpe1xuXHRcdFx0XHRyb290LmFkZCggbmV3IFRIUkVFLkF4aXNIZWxwZXIoMSkgKTtcblx0XHRcdH1cblx0XHRcblx0XHRcdHNlbGYubG9hZEFzc2V0cyhtb2R1bGUuYXNzZXRzLCBzaW5nbGV0b25zKS50aGVuKChyZXN1bHRzKSA9PiB7XG5cdFx0XHRcdG1vZHVsZS5pbml0aWFsaXplKHNlbGYuZW52LCByb290LCByZXN1bHRzKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdFxuXHRcdC8vIHN0YXJ0IGFuaW1hdGluZ1xuXHRcdHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoZnVuY3Rpb24gYW5pbWF0ZSh0aW1lc3RhbXApXG5cdFx0e1xuXHRcdFx0d2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZShhbmltYXRlKTtcblx0XHRcdHNlbGYuc2NlbmUudXBkYXRlQWxsQmVoYXZpb3JzKCk7XG5cdFx0XHRpZih3aW5kb3cuVFdFRU4pIFRXRUVOLnVwZGF0ZSgpO1xuXHRcdFx0c2VsZi5yZW5kZXJlci5yZW5kZXIoc2VsZi5zY2VuZSwgc2VsZi5wcmV2aWV3Q2FtZXJhKTtcblx0XHR9KTtcblx0fVxuXG5cdGxvYWRBc3NldHMobWFuaWZlc3QsIHNpbmdsZXRvbnMpXG5cdHtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0XHRjbGFzcyBQcm9taXNlc0ZpbmlzaGVkIGV4dGVuZHMgUHJvbWlzZSB7XG5cdFx0XHRjb25zdHJ1Y3RvcihhcnIpe1xuXHRcdFx0XHRzdXBlcigocmVzb2x2ZSwgcmVqZWN0KSA9PlxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dmFyIHdhaXRpbmcgPSBhcnIubGVuZ3RoO1xuXHRcdFx0XHRcblx0XHRcdFx0XHRmdW5jdGlvbiBjaGVja0RvbmUoKXtcblx0XHRcdFx0XHRcdGlmKC0td2FpdGluZyA9PT0gMClcblx0XHRcdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGFyci5mb3JFYWNoKHAgPT4geyBwLnRoZW4oY2hlY2tEb25lLCBjaGVja0RvbmUpOyB9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XG5cdFx0e1xuXHRcdFx0Ly8gcG9wdWxhdGUgY2FjaGVcblx0XHRcdFByb21pc2VzRmluaXNoZWQoW1xuXG5cdFx0XHRcdC8vIHBvcHVsYXRlIG1vZGVsIGNhY2hlXG5cdFx0XHRcdFByb21pc2UuYWxsKE9iamVjdC5rZXlzKG1hbmlmZXN0Lm1vZGVscyB8fCB7fSkubWFwKGlkID0+XG5cdFx0XHRcdHtcblx0XHRcdFx0XHR2YXIgdXJsID0gbWFuaWZlc3QubW9kZWxzW2lkXTtcblx0XHRcdFx0XHRpZihzZWxmLmFzc2V0Q2FjaGUubW9kZWxzW3VybF0pXG5cdFx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHNlbGYuYXNzZXRDYWNoZS5tb2RlbHNbdXJsXSk7XG5cdFx0XHRcdFx0ZWxzZVxuXHRcdFx0XHRcdFx0cmV0dXJuIExvYWRlcnMuTW9kZWxQcm9taXNlKHVybCkudGhlbihtb2RlbCA9PiB7XG5cdFx0XHRcdFx0XHRcdHNlbGYuYXNzZXRDYWNoZS5tb2RlbHNbdXJsXSA9IG1vZGVsO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pKSxcblxuXHRcdFx0XHQvLyBwb3B1bGF0ZSBleHBsaWNpdCB0ZXh0dXJlIGNhY2hlXG5cdFx0XHRcdFByb21pc2UuYWxsKE9iamVjdC5rZXlzKG1hbmlmZXN0LnRleHR1cmVzIHx8IHt9KS5tYXAoaWQgPT5cblx0XHRcdFx0e1xuXHRcdFx0XHRcdHZhciB1cmwgPSBtYW5pZmVzdC50ZXh0dXJlc1tpZF07XG5cdFx0XHRcdFx0aWYoc2VsZi5hc3NldENhY2hlLnRleHR1cmVzW3VybF0pXG5cdFx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHNlbGYuYXNzZXRDYWNoZS50ZXh0dXJlc1t1cmxdKTtcblx0XHRcdFx0XHRlbHNlXG5cdFx0XHRcdFx0XHRyZXR1cm4gTG9hZGVycy5UZXh0dXJlUHJvbWlzZSh1cmwpLnRoZW4odGV4dHVyZSA9PiB7XG5cdFx0XHRcdFx0XHRcdHNlbGYuYXNzZXRDYWNoZS50ZXh0dXJlc1t1cmxdID0gdGV4dHVyZTtcblx0XHRcdFx0XHRcdH0pO1x0XHRcdFxuXHRcdFx0XHR9KSlcblx0XHRcdF0pXG5cblx0XHRcdC50aGVuKCgpID0+XG5cdFx0XHR7XG5cdFx0XHRcdC8vIHBvcHVsYXRlIHBheWxvYWQgZnJvbSBjYWNoZVxuXHRcdFx0XHR2YXIgcGF5bG9hZCA9IHttb2RlbHM6IHt9LCB0ZXh0dXJlczoge319O1xuXG5cdFx0XHRcdGZvcihsZXQgaSBpbiBtYW5pZmVzdC5tb2RlbHMpe1xuXHRcdFx0XHRcdGxldCB1cmwgPSBtYW5pZmVzdC5tb2RlbHNbaV07XG5cdFx0XHRcdFx0bGV0IHQgPSBzZWxmLmFzc2V0Q2FjaGUubW9kZWxzW3VybF07XG5cdFx0XHRcdFx0cGF5bG9hZC5tb2RlbHNbaV0gPSB0ID8gc2luZ2xldG9uc1t1cmxdID8gdCA6IHQuY2xvbmUoKSA6IG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRmb3IobGV0IGkgaW4gbWFuaWZlc3QudGV4dHVyZXMpe1xuXHRcdFx0XHRcdGxldCB1cmwgPSBtYW5pZmVzdC50ZXh0dXJlc1tpXTtcblx0XHRcdFx0XHRsZXQgdCA9IHNlbGYuYXNzZXRDYWNoZS50ZXh0dXJlc1t1cmxdO1xuXHRcdFx0XHRcdHBheWxvYWQudGV4dHVyZXNbaV0gPSB0ID8gc2luZ2xldG9uc1t1cmxdID8gdCA6IHQuY2xvbmUoKSA6IG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXNvbHZlKHBheWxvYWQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxufTtcbiJdLCJuYW1lcyI6WyJzdXBlciIsImxldCIsImxvYWRlciIsInJpZ2h0IiwiTG9hZGVycy5Nb2RlbFByb21pc2UiLCJMb2FkZXJzLlRleHR1cmVQcm9taXNlIiwiaSIsInVybCIsInQiXSwibWFwcGluZ3MiOiI7OztBQUVBLElBQU0sWUFBWSxHQUFnQjtDQUFDLHFCQUN2QixDQUFDLEdBQUcsQ0FBQztFQUNmQSxPQUFLLEtBQUEsQ0FBQyxNQUFBLFVBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRTs7R0FFdkIsR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3ZCLEdBQUcsS0FBSyxDQUFDLFVBQVUsQ0FBQztLQUNuQkMsSUFBSSxNQUFNLEdBQUcsSUFBSSxLQUFLLENBQUMsVUFBVSxFQUFFLENBQUM7S0FDcEMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsVUFBQyxNQUFNLEVBQUU7TUFDekIsT0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO01BQzlDLENBQUMsQ0FBQztLQUNIO1NBQ0k7S0FDSixPQUFPLENBQUMsS0FBSyxDQUFDLENBQUEsZ0NBQThCLEdBQUUsR0FBRyxtQkFBYyxDQUFDLENBQUMsQ0FBQztLQUNsRSxNQUFNLEVBQUUsQ0FBQztLQUNUO0lBQ0Q7UUFDSSxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDM0IsR0FBRyxLQUFLLENBQUMsYUFBYSxDQUFDO0tBQ3RCQSxJQUFJQyxRQUFNLEdBQUcsSUFBSSxLQUFLLENBQUMsYUFBYSxF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
