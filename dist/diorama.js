var Diorama = (function () {
'use strict';

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

function TexturePromise(url){
	return new Promise(function (resolve, reject) {
		if(cache.textures[url])
			{ return resolve(cache.textures[url]); }
		else {
			var loader = new THREE.TextureLoader();
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
		else { return (new TexturePromise(url)).then(function (tex) {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjpudWxsLCJzb3VyY2VzIjpbIi4uL3NyYy9sb2FkZXJzLmpzIiwiLi4vc3JjL2NhbWVyYS5qcyIsIi4uL3NyYy9tYWluLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcclxuXHJcbmxldCBjYWNoZSA9IHttb2RlbHM6IHt9LCB0ZXh0dXJlczoge30sIHBvc3RlcnM6IHt9fTtcclxuXHJcbmZ1bmN0aW9uIE1vZGVsUHJvbWlzZSh1cmwpXHJcbntcclxuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT5cclxuXHR7XHJcblx0XHRpZihjYWNoZS5tb2RlbHNbdXJsXSl7XHJcblx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLm1vZGVsc1t1cmxdKTtcclxuXHRcdH1cclxuXHJcblx0XHQvLyBOT1RFOiBnbFRGIGxvYWRlciBkb2VzIG5vdCBjYXRjaCBlcnJvcnNcclxuXHRcdGVsc2UgaWYoL1xcLmdsdGYkL2kudGVzdCh1cmwpKXtcclxuXHRcdFx0aWYoVEhSRUUuZ2xURkxvYWRlcil7XHJcblx0XHRcdFx0bGV0IGxvYWRlciA9IG5ldyBUSFJFRS5nbFRGTG9hZGVyKCk7XHJcblx0XHRcdFx0bG9hZGVyLmxvYWQodXJsLCAocmVzdWx0KSA9PiB7XHJcblx0XHRcdFx0XHRjYWNoZS5tb2RlbHNbdXJsXSA9IHJlc3VsdC5zY2VuZS5jaGlsZHJlblswXS5jaGlsZHJlblswXTtcclxuXHRcdFx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLm1vZGVsc1t1cmxdKTtcclxuXHRcdFx0XHR9KTtcclxuXHRcdFx0fVxyXG5cdFx0XHRlbHNlIGlmKFRIUkVFLkdMVEZMb2FkZXIpe1xyXG5cdFx0XHRcdGxldCBsb2FkZXIgPSBuZXcgVEhSRUUuR0xURkxvYWRlcigpO1xyXG5cdFx0XHRcdGxvYWRlci5sb2FkKHVybCwgcmVzdWx0ID0+IHtcclxuXHRcdFx0XHRcdGNhY2hlLm1vZGVsc1t1cmxdID0gcmVzdWx0LnNjZW5lLmNoaWxkcmVuWzBdO1xyXG5cdFx0XHRcdFx0Y2FjaGUubW9kZWxzW3VybF0ubWF0cml4QXV0b1VwZGF0ZSA9IHRydWU7XHJcblx0XHRcdFx0XHQvKnJlc3VsdC5zY2VuZS50cmF2ZXJzZSgobykgPT4ge1xyXG5cdFx0XHRcdFx0XHRpZihvLm1hdGVyaWFsICYmIG8ubWF0ZXJpYWwubWFwKVxyXG5cdFx0XHRcdFx0XHRcdGNvbnNvbGUubG9nKCdmbGlwWScsIG8ubWF0ZXJpYWwubWFwLmZsaXBZKTtcclxuXHRcdFx0XHRcdH0pOyovXHJcblxyXG5cclxuXHRcdFx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLm1vZGVsc1t1cmxdKTtcclxuXHRcdFx0XHR9LCAoKSA9PiB7fSwgcmVqZWN0KTtcclxuXHRcdFx0fVxyXG5cdFx0XHRlbHNlIHtcclxuXHRcdFx0XHRjb25zb2xlLmVycm9yKGBnbFRGIGxvYWRlciBub3QgZm91bmQuIFwiJHt1cmx9XCIgbm90IGxvYWRlZC5gKTtcclxuXHRcdFx0XHRyZWplY3QoKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdGVsc2UgaWYoL1xcLmRhZSQvaS50ZXN0KHVybCkpe1xyXG5cdFx0XHRpZihUSFJFRS5Db2xsYWRhTG9hZGVyKXtcclxuXHRcdFx0XHRsZXQgbG9hZGVyID0gbmV3IFRIUkVFLkNvbGxhZGFMb2FkZXIoKTtcclxuXHRcdFx0XHRsb2FkZXIubG9hZCh1cmwsIHJlc3VsdCA9PiB7XHJcblx0XHRcdFx0XHRjYWNoZS5tb2RlbHNbdXJsXSA9IHJlc3VsdC5zY2VuZS5jaGlsZHJlblswXTtcclxuXHRcdFx0XHRcdHJldHVybiByZXNvbHZlKHJlc3VsdC5zY2VuZS5jaGlsZHJlblswXSlcclxuXHRcdFx0XHR9LCBudWxsLCByZWplY3QpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoYENvbGxhZGEgbG9hZGVyIG5vdCBmb3VuZC4gXCIke3VybH1cIiBub3QgbG9hZGVkLmApO1xyXG5cdFx0XHRcdHJlamVjdCgpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblx0fSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIFRleHR1cmVQcm9taXNlKHVybCl7XHJcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XHJcblx0e1xyXG5cdFx0aWYoY2FjaGUudGV4dHVyZXNbdXJsXSlcclxuXHRcdFx0cmV0dXJuIHJlc29sdmUoY2FjaGUudGV4dHVyZXNbdXJsXSk7XHJcblx0XHRlbHNlIHtcclxuXHRcdFx0bGV0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKCk7XHJcblx0XHRcdGxvYWRlci5sb2FkKHVybCwgdGV4dHVyZSA9PiB7XHJcblx0XHRcdFx0Y2FjaGUudGV4dHVyZXNbdXJsXSA9IHRleHR1cmU7XHJcblx0XHRcdFx0cmV0dXJuIHJlc29sdmUodGV4dHVyZSk7XHJcblx0XHRcdH0sIG51bGwsIHJlamVjdCk7XHJcblx0XHR9XHJcblx0fSk7XHJcbn1cclxuXHJcbmNsYXNzIFZpZGVvUHJvbWlzZSBleHRlbmRzIFByb21pc2Uge1xyXG5cdGNvbnN0cnVjdG9yKHVybClcclxuXHR7XHJcblx0XHQvLyBzdGFydCBsb2FkZXJcclxuXHRcdHZhciB2aWRTcmMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd2aWRlbycpO1xyXG5cdFx0dmlkU3JjLmF1dG9wbGF5ID0gdHJ1ZTtcclxuXHRcdHZpZFNyYy5sb29wID0gdHJ1ZTtcclxuXHRcdHZpZFNyYy5zcmMgPSB1cmw7XHJcblx0XHR2aWRTcmMuc3R5bGUuZGlzcGxheSA9ICdub25lJztcclxuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQodmlkU3JjKTtcclxuXHJcblx0XHR2YXIgdGV4ID0gbmV3IFRIUkVFLlZpZGVvVGV4dHVyZSh2aWRTcmMpO1xyXG5cdFx0dGV4Lm1pbkZpbHRlciA9IFRIUkVFLkxpbmVhckZpbHRlcjtcclxuXHRcdHRleC5tYWdGaWx0ZXIgPSBUSFJFRS5MaW5lYXJGaWx0ZXI7XHJcblx0XHR0ZXguZm9ybWF0ID0gVEhSRUUuUkdCRm9ybWF0O1xyXG5cclxuXHRcdC8vY2FjaGUudmlkZW9zW3VybF0gPSB0ZXg7XHJcblx0XHQvL3BheWxvYWQudmlkZW9zW2lkXSA9IGNhY2hlLnZpZGVvc1t1cmxdO1xyXG5cclxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGV4KTtcclxuXHR9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIFBvc3RlclByb21pc2UodXJsKXtcclxuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT5cclxuXHR7XHJcblx0XHRpZihjYWNoZS5wb3N0ZXJzW3VybF0pXHJcblx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLnBvc3RlcnNbdXJsXSk7XHJcblx0XHRlbHNlIHJldHVybiAobmV3IFRleHR1cmVQcm9taXNlKHVybCkpLnRoZW4odGV4ID0+XHJcblx0XHRcdHtcclxuXHRcdFx0XHRsZXQgcmF0aW8gPSB0ZXguaW1hZ2Uud2lkdGggLyB0ZXguaW1hZ2UuaGVpZ2h0O1xyXG5cdFx0XHRcdGxldCBnZW8sIG1hdCA9IG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7bWFwOiB0ZXgsIHNpZGU6IFRIUkVFLkRvdWJsZVNpZGV9KTtcclxuXHJcblx0XHRcdFx0aWYocmF0aW8gPiAxKXtcclxuXHRcdFx0XHRcdGdlbyA9IG5ldyBUSFJFRS5QbGFuZUdlb21ldHJ5KDEsIDEvcmF0aW8pO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHRlbHNlIHtcclxuXHRcdFx0XHRcdGdlbyA9IG5ldyBUSFJFRS5QbGFuZUdlb21ldHJ5KHJhdGlvLCAxKTtcclxuXHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdGNhY2hlLnBvc3RlcnNbdXJsXSA9IG5ldyBUSFJFRS5NZXNoKGdlbywgbWF0KTtcclxuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZShjYWNoZS5wb3N0ZXJzW3VybF0pO1xyXG5cdFx0XHR9XHJcblx0XHQpO1xyXG5cdH0pO1xyXG59XHJcblxyXG5leHBvcnQgeyBNb2RlbFByb21pc2UsIFRleHR1cmVQcm9taXNlLCBWaWRlb1Byb21pc2UsIFBvc3RlclByb21pc2UsIGNhY2hlIGFzIF9jYWNoZSB9O1xyXG4iLCIndXNlIHN0cmljdCc7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBQcmV2aWV3Q2FtZXJhIGV4dGVuZHMgVEhSRUUuT3J0aG9ncmFwaGljQ2FtZXJhXHJcbntcclxuXHRjb25zdHJ1Y3Rvcihmb2N1cywgdmlld1NpemUsIGxvb2tEaXJlY3Rpb24pXHJcblx0e1xyXG5cdFx0c3VwZXIoLTEsIDEsIDEsIC0xLCAuMSwgNDAwKTtcclxuXHJcblx0XHRsZXQgc2V0dGluZ3MgPSB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2Rpb3JhbWFWaWV3U2V0dGluZ3MnKTtcclxuXHRcdGlmKHNldHRpbmdzKXtcclxuXHRcdFx0c2V0dGluZ3MgPSBKU09OLnBhcnNlKHNldHRpbmdzKTtcclxuXHRcdFx0aWYoIWZvY3VzKVxyXG5cdFx0XHRcdGZvY3VzID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5mcm9tQXJyYXkoc2V0dGluZ3MuZm9jdXMpO1xyXG5cdFx0XHRpZighdmlld1NpemUpXHJcblx0XHRcdFx0dmlld1NpemUgPSBzZXR0aW5ncy52aWV3U2l6ZTtcclxuXHRcdFx0aWYoIWxvb2tEaXJlY3Rpb24pXHJcblx0XHRcdFx0bG9va0RpcmVjdGlvbiA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuZnJvbUFycmF5KHNldHRpbmdzLmxvb2tEaXJlY3Rpb24pO1xyXG5cdFx0fVxyXG5cclxuXHRcdHRoaXMuX3ZpZXdTaXplID0gdmlld1NpemUgfHwgNDA7XHJcblx0XHR0aGlzLl9mb2N1cyA9IGZvY3VzIHx8IG5ldyBUSFJFRS5WZWN0b3IzKCk7XHJcblx0XHR0aGlzLl9sb29rRGlyZWN0aW9uID0gbG9va0RpcmVjdGlvbiB8fCBuZXcgVEhSRUUuVmVjdG9yMygwLC0xLDApO1xyXG5cdFx0dGhpcy5ncmlkSGVscGVyID0gbmV3IFRIUkVFLkdyaWRIZWxwZXIoMzAwLCAxKTtcclxuXHRcdHRoaXMuZ3JpZEhlbHBlci51c2VyRGF0YSA9IHthbHRzcGFjZToge2NvbGxpZGVyOiB7ZW5hYmxlZDogZmFsc2V9fX07XHJcblx0XHQvL3RoaXMuZ3JpZEhlbHBlci5xdWF0ZXJuaW9uLnNldEZyb21Vbml0VmVjdG9ycyggbmV3IFRIUkVFLlZlY3RvcjMoMCwtMSwwKSwgdGhpcy5fbG9va0RpcmVjdGlvbiApO1xyXG5cdH1cclxuXHJcblx0Z2V0IHZpZXdTaXplKCl7XHJcblx0XHRyZXR1cm4gdGhpcy5fdmlld1NpemU7XHJcblx0fVxyXG5cdHNldCB2aWV3U2l6ZSh2YWwpe1xyXG5cdFx0dGhpcy5fdmlld1NpemUgPSB2YWw7XHJcblx0XHR0aGlzLnJlY29tcHV0ZVZpZXdwb3J0KCk7XHJcblx0fVxyXG5cclxuXHRnZXQgZm9jdXMoKXtcclxuXHRcdHJldHVybiB0aGlzLl9mb2N1cztcclxuXHR9XHJcblx0c2V0IGZvY3VzKHZhbCl7XHJcblx0XHR0aGlzLl9mb2N1cy5jb3B5KHZhbCk7XHJcblx0XHR0aGlzLnJlY29tcHV0ZVZpZXdwb3J0KCk7XHJcblx0fVxyXG5cclxuXHRnZXQgbG9va0RpcmVjdGlvbigpe1xyXG5cdFx0cmV0dXJuIHRoaXMuX2xvb2tEaXJlY3Rpb247XHJcblx0fVxyXG5cdHNldCBsb29rRGlyZWN0aW9uKHZhbCl7XHJcblx0XHR0aGlzLl9sb29rRGlyZWN0aW9uLmNvcHkodmFsKTtcclxuXHRcdHRoaXMucmVjb21wdXRlVmlld3BvcnQoKTtcclxuXHR9XHJcblxyXG5cdHJlZ2lzdGVySG9va3MocmVuZGVyZXIpXHJcblx0e1xyXG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xyXG5cdFx0c2VsZi5yZW5kZXJlciA9IHJlbmRlcmVyO1xyXG5cclxuXHRcdC8vIHNldCBzdHlsZXMgb24gdGhlIHBhZ2UsIHNvIHRoZSBwcmV2aWV3IHdvcmtzIHJpZ2h0XHJcblx0XHRkb2N1bWVudC5ib2R5LnBhcmVudEVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xyXG5cdFx0ZG9jdW1lbnQuYm9keS5zdHlsZS5oZWlnaHQgPSAnMTAwJSc7XHJcblx0XHRkb2N1bWVudC5ib2R5LnN0eWxlLm1hcmdpbiA9ICcwJztcclxuXHRcdGRvY3VtZW50LmJvZHkuc3R5bGUub3ZlcmZsb3cgPSAnaGlkZGVuJztcclxuXHJcblx0XHR2YXIgaW5mbyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcclxuXHRcdGluZm8uaW5uZXJIVE1MID0gWydNaWRkbGUgY2xpY2sgYW5kIGRyYWcgdG8gcGFuJywgJ01vdXNlIHdoZWVsIHRvIHpvb20nLCAnQXJyb3cga2V5cyB0byByb3RhdGUnXS5qb2luKCc8YnIvPicpO1xyXG5cdFx0T2JqZWN0LmFzc2lnbihpbmZvLnN0eWxlLCB7XHJcblx0XHRcdHBvc2l0aW9uOiAnZml4ZWQnLFxyXG5cdFx0XHR0b3A6ICcxMHB4JyxcclxuXHRcdFx0bGVmdDogJzEwcHgnLFxyXG5cdFx0XHRtYXJnaW46IDBcclxuXHRcdH0pO1xyXG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChpbmZvKTtcclxuXHJcblx0XHQvLyByZXNpemUgdGhlIHByZXZpZXcgY2FudmFzIHdoZW4gd2luZG93IHJlc2l6ZXNcclxuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCBlID0+IHNlbGYucmVjb21wdXRlVmlld3BvcnQoKSk7XHJcblx0XHRzZWxmLnJlY29tcHV0ZVZpZXdwb3J0KCk7XHJcblxyXG5cdFx0Ly8gbWlkZGxlIGNsaWNrIGFuZCBkcmFnIHRvIHBhbiB2aWV3XHJcblx0XHR2YXIgZHJhZ1N0YXJ0ID0gbnVsbCwgZm9jdXNTdGFydCA9IG51bGw7XHJcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgZSA9PiB7XHJcblx0XHRcdGlmKGUuYnV0dG9uID09PSAxKXtcclxuXHRcdFx0XHRkcmFnU3RhcnQgPSB7eDogZS5jbGllbnRYLCB5OiBlLmNsaWVudFl9O1xyXG5cdFx0XHRcdGZvY3VzU3RhcnQgPSBzZWxmLl9mb2N1cy5jbG9uZSgpO1xyXG5cdFx0XHR9XHJcblx0XHR9KTtcclxuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgZSA9PiB7XHJcblx0XHRcdGlmKGUuYnV0dG9uID09PSAxKXtcclxuXHRcdFx0XHRkcmFnU3RhcnQgPSBudWxsO1xyXG5cdFx0XHRcdGZvY3VzU3RhcnQgPSBudWxsO1xyXG5cdFx0XHR9XHJcblx0XHR9KTtcclxuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCBlID0+IHtcclxuXHRcdFx0aWYoZHJhZ1N0YXJ0KVxyXG5cdFx0XHR7XHJcblx0XHRcdFx0bGV0IHtjbGllbnRXaWR0aDogdywgY2xpZW50SGVpZ2h0OiBofSA9IGRvY3VtZW50LmJvZHk7XHJcblx0XHRcdFx0bGV0IHBpeGVsc1Blck1ldGVyID0gTWF0aC5zcXJ0KHcqdytoKmgpIC8gc2VsZi5fdmlld1NpemU7XHJcblx0XHRcdFx0bGV0IGR4ID0gZS5jbGllbnRYIC0gZHJhZ1N0YXJ0LngsIGR5ID0gZS5jbGllbnRZIC0gZHJhZ1N0YXJ0Lnk7XHJcblx0XHRcdFx0bGV0IHJpZ2h0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5jcm9zc1ZlY3RvcnMoc2VsZi5fbG9va0RpcmVjdGlvbiwgc2VsZi51cCk7XHJcblxyXG5cdFx0XHRcdHNlbGYuX2ZvY3VzLmNvcHkoZm9jdXNTdGFydClcclxuXHRcdFx0XHRcdC5hZGQoc2VsZi51cC5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKGR5L3BpeGVsc1Blck1ldGVyKSlcclxuXHRcdFx0XHRcdC5hZGQocmlnaHQubXVsdGlwbHlTY2FsYXIoLWR4L3BpeGVsc1Blck1ldGVyKSk7XHJcblxyXG5cdFx0XHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblxyXG5cdFx0Ly8gd2hlZWwgdG8gem9vbVxyXG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3doZWVsJywgZSA9PiB7XHJcblx0XHRcdGlmKGUuZGVsdGFZIDwgMCl7XHJcblx0XHRcdFx0c2VsZi5fdmlld1NpemUgKj0gMC45MDtcclxuXHRcdFx0XHRzZWxmLnJlY29tcHV0ZVZpZXdwb3J0KCk7XHJcblx0XHRcdH1cclxuXHRcdFx0ZWxzZSBpZihlLmRlbHRhWSA+IDApe1xyXG5cdFx0XHRcdHNlbGYuX3ZpZXdTaXplICo9IDEuMTtcclxuXHRcdFx0XHRzZWxmLnJlY29tcHV0ZVZpZXdwb3J0KCk7XHJcblx0XHRcdH1cclxuXHRcdH0pO1xyXG5cclxuXHRcdC8vIGFycm93IGtleXMgdG8gcm90YXRlXHJcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGUgPT4ge1xyXG5cdFx0XHRpZihlLmtleSA9PT0gJ0Fycm93RG93bicpe1xyXG5cdFx0XHRcdGxldCByaWdodCA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuY3Jvc3NWZWN0b3JzKHNlbGYuX2xvb2tEaXJlY3Rpb24sIHNlbGYudXApO1xyXG5cdFx0XHRcdHNlbGYuX2xvb2tEaXJlY3Rpb24uYXBwbHlBeGlzQW5nbGUocmlnaHQsIE1hdGguUEkvMik7XHJcblx0XHRcdFx0Ly9zZWxmLmdyaWRIZWxwZXIucm90YXRlT25BeGlzKHJpZ2h0LCBNYXRoLlBJLzIpO1xyXG5cdFx0XHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRlbHNlIGlmKGUua2V5ID09PSAnQXJyb3dVcCcpe1xyXG5cdFx0XHRcdGxldCByaWdodCA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuY3Jvc3NWZWN0b3JzKHNlbGYuX2xvb2tEaXJlY3Rpb24sIHNlbGYudXApO1xyXG5cdFx0XHRcdHNlbGYuX2xvb2tEaXJlY3Rpb24uYXBwbHlBeGlzQW5nbGUocmlnaHQsIC1NYXRoLlBJLzIpO1xyXG5cdFx0XHRcdC8vc2VsZi5ncmlkSGVscGVyLnJvdGF0ZU9uQXhpcyhyaWdodCwgLU1hdGguUEkvMik7XHJcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xyXG5cclxuXHRcdFx0fVxyXG5cdFx0XHRlbHNlIGlmKGUua2V5ID09PSAnQXJyb3dMZWZ0Jyl7XHJcblx0XHRcdFx0c2VsZi5fbG9va0RpcmVjdGlvbi5hcHBseUF4aXNBbmdsZShzZWxmLnVwLCAtTWF0aC5QSS8yKTtcclxuXHRcdFx0XHQvL3NlbGYuZ3JpZEhlbHBlci5yb3RhdGVPbkF4aXMoc2VsZi51cCwgLU1hdGguUEkvMik7XHJcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2UgaWYoZS5rZXkgPT09ICdBcnJvd1JpZ2h0Jyl7XHJcblx0XHRcdFx0c2VsZi5fbG9va0RpcmVjdGlvbi5hcHBseUF4aXNBbmdsZShzZWxmLnVwLCBNYXRoLlBJLzIpO1xyXG5cdFx0XHRcdC8vc2VsZi5ncmlkSGVscGVyLnJvdGF0ZU9uQXhpcyhzZWxmLnVwLCBNYXRoLlBJLzIpO1xyXG5cdFx0XHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblx0fVxyXG5cclxuXHRyZWNvbXB1dGVWaWV3cG9ydCgpXHJcblx0e1xyXG5cdFx0dmFyIHtjbGllbnRXaWR0aDogdywgY2xpZW50SGVpZ2h0OiBofSA9IGRvY3VtZW50LmJvZHk7XHJcblxyXG5cdFx0Ly8gcmVzaXplIGNhbnZhc1xyXG5cdFx0dGhpcy5yZW5kZXJlci5zZXRTaXplKHcsIGgpO1xyXG5cclxuXHRcdC8vIGNvbXB1dGUgd2luZG93IGRpbWVuc2lvbnMgZnJvbSB2aWV3IHNpemVcclxuXHRcdHZhciByYXRpbyA9IHcvaDtcclxuXHRcdHZhciBoZWlnaHQgPSBNYXRoLnNxcnQoICh0aGlzLl92aWV3U2l6ZSp0aGlzLl92aWV3U2l6ZSkgLyAocmF0aW8qcmF0aW8gKyAxKSApO1xyXG5cdFx0dmFyIHdpZHRoID0gcmF0aW8gKiBoZWlnaHQ7XHJcblxyXG5cdFx0Ly8gc2V0IGZydXN0cnVtIGVkZ2VzXHJcblx0XHR0aGlzLmxlZnQgPSAtd2lkdGgvMjtcclxuXHRcdHRoaXMucmlnaHQgPSB3aWR0aC8yO1xyXG5cdFx0dGhpcy50b3AgPSBoZWlnaHQvMjtcclxuXHRcdHRoaXMuYm90dG9tID0gLWhlaWdodC8yO1xyXG5cclxuXHRcdHRoaXMudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xyXG5cclxuXHRcdC8vIHVwZGF0ZSBwb3NpdGlvblxyXG5cdFx0dGhpcy5wb3NpdGlvbi5jb3B5KHRoaXMuX2ZvY3VzKS5zdWIoIHRoaXMuX2xvb2tEaXJlY3Rpb24uY2xvbmUoKS5tdWx0aXBseVNjYWxhcigyMDApICk7XHJcblx0XHRpZiggTWF0aC5hYnMoIHRoaXMuX2xvb2tEaXJlY3Rpb24ubm9ybWFsaXplKCkuZG90KG5ldyBUSFJFRS5WZWN0b3IzKDAsLTEsMCkpICkgPT09IDEgKVxyXG5cdFx0XHR0aGlzLnVwLnNldCgwLDAsMSk7IC8vIGlmIHdlJ3JlIGxvb2tpbmcgZG93biB0aGUgWSBheGlzXHJcblx0XHRlbHNlXHJcblx0XHRcdHRoaXMudXAuc2V0KDAsMSwwKTtcclxuXHRcdHRoaXMubG9va0F0KCB0aGlzLl9mb2N1cyApO1xyXG5cclxuXHRcdHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnZGlvcmFtYVZpZXdTZXR0aW5ncycsIEpTT04uc3RyaW5naWZ5KHtcclxuXHRcdFx0Zm9jdXM6IHRoaXMuX2ZvY3VzLnRvQXJyYXkoKSxcclxuXHRcdFx0dmlld1NpemU6IHRoaXMuX3ZpZXdTaXplLFxyXG5cdFx0XHRsb29rRGlyZWN0aW9uOiB0aGlzLl9sb29rRGlyZWN0aW9uLnRvQXJyYXkoKVxyXG5cdFx0fSkpO1xyXG5cdH1cclxufVxyXG4iLCIndXNlIHN0cmljdCc7XHJcblxyXG5pbXBvcnQgKiBhcyBMb2FkZXJzIGZyb20gJy4vbG9hZGVycyc7XHJcbmltcG9ydCBQcmV2aWV3Q2FtZXJhIGZyb20gJy4vY2FtZXJhJztcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIERpb3JhbWFcclxue1xyXG5cdGNvbnN0cnVjdG9yKHtiZ0NvbG9yPTB4YWFhYWFhLCBncmlkT2Zmc2V0PVswLDAsMF0sIGZ1bGxzcGFjZT1mYWxzZX0gPSB7fSlcclxuXHR7XHJcblx0XHR2YXIgc2VsZiA9IHRoaXM7XHJcblx0XHRzZWxmLl9jYWNoZSA9IExvYWRlcnMuX2NhY2hlO1xyXG5cdFx0c2VsZi5zY2VuZSA9IG5ldyBUSFJFRS5TY2VuZSgpO1xyXG5cclxuXHRcdC8vIHNldCB1cCByZW5kZXJlciBhbmQgc2NhbGVcclxuXHRcdGlmKGFsdHNwYWNlLmluQ2xpZW50KVxyXG5cdFx0e1xyXG5cdFx0XHRzZWxmLnJlbmRlcmVyID0gYWx0c3BhY2UuZ2V0VGhyZWVKU1JlbmRlcmVyKCk7XHJcblx0XHRcdHNlbGYuX2VudlByb21pc2UgPSBQcm9taXNlLmFsbChbYWx0c3BhY2UuZ2V0RW5jbG9zdXJlKCksIGFsdHNwYWNlLmdldFNwYWNlKCldKVxyXG5cdFx0XHQudGhlbigoW2UsIHNdKSA9PiB7XHJcblxyXG5cdFx0XHRcdGZ1bmN0aW9uIGFkanVzdFNjYWxlKCl7XHJcblx0XHRcdFx0XHRzZWxmLnNjZW5lLnNjYWxlLnNldFNjYWxhcihlLnBpeGVsc1Blck1ldGVyKTtcclxuXHRcdFx0XHRcdHNlbGYuZW52ID0gT2JqZWN0LmFzc2lnbih7fSwgZSwgcyk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdGFkanVzdFNjYWxlKCk7XHJcblxyXG5cdFx0XHRcdGlmKGZ1bGxzcGFjZSl7XHJcblx0XHRcdFx0XHRzZWxmLl9mc1Byb21pc2UgPSBlLnJlcXVlc3RGdWxsc3BhY2UoKS5jYXRjaCgoZSkgPT4gY29uc29sZS53YXJuKCdSZXF1ZXN0IGZvciBmdWxsc3BhY2UgZGVuaWVkJykpO1xyXG5cdFx0XHRcdFx0ZS5hZGRFdmVudExpc3RlbmVyKCdmdWxsc3BhY2VjaGFuZ2UnLCBhZGp1c3RTY2FsZSk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdGVsc2VcclxuXHRcdFx0XHRcdHNlbGYuX2ZzUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xyXG5cdFx0XHR9KTtcclxuXHRcdH1cclxuXHRcdGVsc2VcclxuXHRcdHtcclxuXHRcdFx0Ly8gc2V0IHVwIHByZXZpZXcgcmVuZGVyZXIsIGluIGNhc2Ugd2UncmUgb3V0IG9mIHdvcmxkXHJcblx0XHRcdHNlbGYucmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcigpO1xyXG5cdFx0XHRzZWxmLnJlbmRlcmVyLnNldFNpemUoZG9jdW1lbnQuYm9keS5jbGllbnRXaWR0aCwgZG9jdW1lbnQuYm9keS5jbGllbnRIZWlnaHQpO1xyXG5cdFx0XHRzZWxmLnJlbmRlcmVyLnNldENsZWFyQ29sb3IoIGJnQ29sb3IgKTtcclxuXHRcdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChzZWxmLnJlbmRlcmVyLmRvbUVsZW1lbnQpO1xyXG5cclxuXHRcdFx0c2VsZi5wcmV2aWV3Q2FtZXJhID0gbmV3IFByZXZpZXdDYW1lcmEoKTtcclxuXHRcdFx0c2VsZi5wcmV2aWV3Q2FtZXJhLmdyaWRIZWxwZXIucG9zaXRpb24uZnJvbUFycmF5KGdyaWRPZmZzZXQpO1xyXG5cdFx0XHRzZWxmLnNjZW5lLmFkZChzZWxmLnByZXZpZXdDYW1lcmEsIHNlbGYucHJldmlld0NhbWVyYS5ncmlkSGVscGVyKTtcclxuXHRcdFx0c2VsZi5wcmV2aWV3Q2FtZXJhLnJlZ2lzdGVySG9va3Moc2VsZi5yZW5kZXJlcik7XHJcblxyXG5cdFx0XHQvLyBzZXQgdXAgY3Vyc29yIGVtdWxhdGlvblxyXG5cdFx0XHRhbHRzcGFjZS51dGlsaXRpZXMuc2hpbXMuY3Vyc29yLmluaXQoc2VsZi5zY2VuZSwgc2VsZi5wcmV2aWV3Q2FtZXJhLCB7cmVuZGVyZXI6IHNlbGYucmVuZGVyZXJ9KTtcclxuXHJcblx0XHRcdC8vIHN0dWIgZW52aXJvbm1lbnRcclxuXHRcdFx0c2VsZi5lbnYgPSB7XHJcblx0XHRcdFx0aW5uZXJXaWR0aDogMTAyNCxcclxuXHRcdFx0XHRpbm5lckhlaWdodDogMTAyNCxcclxuXHRcdFx0XHRpbm5lckRlcHRoOiAxMDI0LFxyXG5cdFx0XHRcdHBpeGVsc1Blck1ldGVyOiBmdWxsc3BhY2UgPyAxIDogMTAyNC8zLFxyXG5cdFx0XHRcdHNpZDogJ2Jyb3dzZXInLFxyXG5cdFx0XHRcdG5hbWU6ICdicm93c2VyJyxcclxuXHRcdFx0XHR0ZW1wbGF0ZVNpZDogJ2Jyb3dzZXInXHJcblx0XHRcdH07XHJcblxyXG5cdFx0XHRzZWxmLl9lbnZQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XHJcblx0XHRcdHNlbGYuX2ZzUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHJcblxyXG5cdHN0YXJ0KC4uLm1vZHVsZXMpXHJcblx0e1xyXG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xyXG5cclxuXHRcdC8vIGRldGVybWluZSB3aGljaCBhc3NldHMgYXJlbid0IHNoYXJlZFxyXG5cdFx0dmFyIHNpbmdsZXRvbnMgPSB7fTtcclxuXHRcdG1vZHVsZXMuZm9yRWFjaChtb2QgPT5cclxuXHRcdHtcclxuXHRcdFx0ZnVuY3Rpb24gY2hlY2tBc3NldCh1cmwpe1xyXG5cdFx0XHRcdGlmKHNpbmdsZXRvbnNbdXJsXSA9PT0gdW5kZWZpbmVkKSBzaW5nbGV0b25zW3VybF0gPSB0cnVlO1xyXG5cdFx0XHRcdGVsc2UgaWYoc2luZ2xldG9uc1t1cmxdID09PSB0cnVlKSBzaW5nbGV0b25zW3VybF0gPSBmYWxzZTtcclxuXHRcdFx0fVxyXG5cdFx0XHRPYmplY3Qua2V5cyhtb2QuYXNzZXRzLnRleHR1cmVzIHx8IHt9KS5tYXAoayA9PiBtb2QuYXNzZXRzLnRleHR1cmVzW2tdKS5mb3JFYWNoKGNoZWNrQXNzZXQpO1xyXG5cdFx0XHRPYmplY3Qua2V5cyhtb2QuYXNzZXRzLm1vZGVscyB8fCB7fSkubWFwKGsgPT4gbW9kLmFzc2V0cy5tb2RlbHNba10pLmZvckVhY2goY2hlY2tBc3NldCk7XHJcblx0XHRcdE9iamVjdC5rZXlzKG1vZC5hc3NldHMucG9zdGVycyB8fCB7fSkubWFwKGsgPT4gbW9kLmFzc2V0cy5wb3N0ZXJzW2tdKS5mb3JFYWNoKGNoZWNrQXNzZXQpO1xyXG5cdFx0fSk7XHJcblxyXG5cdFx0Ly8gZGV0ZXJtaW5lIGlmIHRoZSB0cmFja2luZyBza2VsZXRvbiBpcyBuZWVkZWRcclxuXHRcdGxldCBuZWVkc1NrZWxldG9uID0gbW9kdWxlcy5yZWR1Y2UoKG5zLG0pID0+IG5zIHx8IG0ubmVlZHNTa2VsZXRvbiwgZmFsc2UpO1xyXG5cdFx0aWYobmVlZHNTa2VsZXRvbiAmJiBhbHRzcGFjZS5pbkNsaWVudCl7XHJcblx0XHRcdHNlbGYuX3NrZWxQcm9taXNlID0gUHJvbWlzZS5hbGwoW1xyXG5cdFx0XHRcdGFsdHNwYWNlLmdldFRocmVlSlNUcmFja2luZ1NrZWxldG9uKCksXHJcblx0XHRcdFx0c2VsZi5fZW52UHJvbWlzZVxyXG5cdFx0XHRdKS50aGVuKHNrZWwgPT4ge1xyXG5cdFx0XHRcdHNlbGYuc2NlbmUuYWRkKHNrZWwpO1xyXG5cdFx0XHRcdHNlbGYuZW52LnNrZWwgPSBza2VsO1xyXG5cdFx0XHRcdHNlbGYuZW52ID0gT2JqZWN0LmZyZWV6ZShzZWxmLmVudik7XHJcblx0XHRcdH0pO1xyXG5cdFx0fVxyXG5cdFx0ZWxzZSB7XHJcblx0XHRcdHNlbGYuX2VudlByb21pc2UudGhlbigoKSA9PiB7XHJcblx0XHRcdFx0c2VsZi5lbnYgPSBPYmplY3QuZnJlZXplKHNlbGYuZW52KTtcclxuXHRcdFx0fSk7XHJcblx0XHRcdHNlbGYuX3NrZWxQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XHJcblx0XHR9XHJcblxyXG5cdFx0UHJvbWlzZS5hbGwoW3NlbGYuX2VudlByb21pc2UsIHNlbGYuX2ZzUHJvbWlzZSwgc2VsZi5fc2tlbFByb21pc2VdKS50aGVuKCgpID0+XHJcblx0XHR7XHJcblx0XHRcdC8vIGNvbnN0cnVjdCBkaW9yYW1hc1xyXG5cdFx0XHRtb2R1bGVzLmZvckVhY2goZnVuY3Rpb24obW9kdWxlKVxyXG5cdFx0XHR7XHJcblx0XHRcdFx0bGV0IHJvb3QgPSBudWxsO1xyXG5cclxuXHRcdFx0XHRpZihtb2R1bGUgaW5zdGFuY2VvZiBUSFJFRS5PYmplY3QzRCl7XHJcblx0XHRcdFx0XHRyb290ID0gbW9kdWxlO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHRlbHNlXHJcblx0XHRcdFx0e1xyXG5cdFx0XHRcdFx0cm9vdCA9IG5ldyBUSFJFRS5PYmplY3QzRCgpO1xyXG5cclxuXHRcdFx0XHRcdC8vIGhhbmRsZSBhYnNvbHV0ZSBwb3NpdGlvbmluZ1xyXG5cdFx0XHRcdFx0aWYobW9kdWxlLnRyYW5zZm9ybSl7XHJcblx0XHRcdFx0XHRcdHJvb3QubWF0cml4LmZyb21BcnJheShtb2R1bGUudHJhbnNmb3JtKTtcclxuXHRcdFx0XHRcdFx0cm9vdC5tYXRyaXguZGVjb21wb3NlKHJvb3QucG9zaXRpb24sIHJvb3QucXVhdGVybmlvbiwgcm9vdC5zY2FsZSk7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRlbHNlIHtcclxuXHRcdFx0XHRcdFx0aWYobW9kdWxlLnBvc2l0aW9uKXtcclxuXHRcdFx0XHRcdFx0XHRyb290LnBvc2l0aW9uLmZyb21BcnJheShtb2R1bGUucG9zaXRpb24pO1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRcdGlmKG1vZHVsZS5yb3RhdGlvbil7XHJcblx0XHRcdFx0XHRcdFx0cm9vdC5yb3RhdGlvbi5mcm9tQXJyYXkobW9kdWxlLnJvdGF0aW9uKTtcclxuXHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0Ly8gaGFuZGxlIHJlbGF0aXZlIHBvc2l0aW9uaW5nXHJcblx0XHRcdFx0aWYobW9kdWxlLnZlcnRpY2FsQWxpZ24pe1xyXG5cdFx0XHRcdFx0bGV0IGhhbGZIZWlnaHQgPSBzZWxmLmVudi5pbm5lckhlaWdodC8oMipzZWxmLmVudi5waXhlbHNQZXJNZXRlcik7XHJcblx0XHRcdFx0XHRzd2l0Y2gobW9kdWxlLnZlcnRpY2FsQWxpZ24pe1xyXG5cdFx0XHRcdFx0Y2FzZSAndG9wJzpcclxuXHRcdFx0XHRcdFx0cm9vdC50cmFuc2xhdGVZKGhhbGZIZWlnaHQpO1xyXG5cdFx0XHRcdFx0XHRicmVhaztcclxuXHRcdFx0XHRcdGNhc2UgJ2JvdHRvbSc6XHJcblx0XHRcdFx0XHRcdHJvb3QudHJhbnNsYXRlWSgtaGFsZkhlaWdodCk7XHJcblx0XHRcdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRcdFx0Y2FzZSAnbWlkZGxlJzpcclxuXHRcdFx0XHRcdFx0Ly8gZGVmYXVsdFxyXG5cdFx0XHRcdFx0XHRicmVhaztcclxuXHRcdFx0XHRcdGRlZmF1bHQ6XHJcblx0XHRcdFx0XHRcdGNvbnNvbGUud2FybignSW52YWxpZCB2YWx1ZSBmb3IgXCJ2ZXJ0aWNhbEFsaWduXCIgLSAnLCBtb2R1bGUudmVydGljYWxBbGlnbik7XHJcblx0XHRcdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0c2VsZi5zY2VuZS5hZGQocm9vdCk7XHJcblxyXG5cdFx0XHRcdGlmKHNlbGYucHJldmlld0NhbWVyYSl7XHJcblx0XHRcdFx0XHRsZXQgYXhpcyA9IG5ldyBUSFJFRS5BeGlzSGVscGVyKDEpO1xyXG5cdFx0XHRcdFx0YXhpcy51c2VyRGF0YS5hbHRzcGFjZSA9IHtjb2xsaWRlcjoge2VuYWJsZWQ6IGZhbHNlfX07XHJcblx0XHRcdFx0XHRyb290LmFkZChheGlzKTtcclxuXHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdHNlbGYubG9hZEFzc2V0cyhtb2R1bGUuYXNzZXRzLCBzaW5nbGV0b25zKS50aGVuKChyZXN1bHRzKSA9PiB7XHJcblx0XHRcdFx0XHRtb2R1bGUuaW5pdGlhbGl6ZShzZWxmLmVudiwgcm9vdCwgcmVzdWx0cyk7XHJcblx0XHRcdFx0fSk7XHJcblx0XHRcdH0pO1xyXG5cdFx0fSk7XHJcblxyXG5cdFx0Ly8gc3RhcnQgYW5pbWF0aW5nXHJcblx0XHR3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKGZ1bmN0aW9uIGFuaW1hdGUodGltZXN0YW1wKVxyXG5cdFx0e1xyXG5cdFx0XHR3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKGFuaW1hdGUpO1xyXG5cdFx0XHRzZWxmLnNjZW5lLnVwZGF0ZUFsbEJlaGF2aW9ycygpO1xyXG5cdFx0XHRpZih3aW5kb3cuVFdFRU4pIFRXRUVOLnVwZGF0ZSgpO1xyXG5cdFx0XHRzZWxmLnJlbmRlcmVyLnJlbmRlcihzZWxmLnNjZW5lLCBzZWxmLnByZXZpZXdDYW1lcmEpO1xyXG5cdFx0fSk7XHJcblx0fVxyXG5cclxuXHRsb2FkQXNzZXRzKG1hbmlmZXN0LCBzaW5nbGV0b25zKVxyXG5cdHtcclxuXHRcdHZhciBzZWxmID0gdGhpcztcclxuXHJcblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT5cclxuXHRcdHtcclxuXHRcdFx0Ly8gcG9wdWxhdGUgY2FjaGVcclxuXHRcdFx0UHJvbWlzZS5hbGwoW1xyXG5cclxuXHRcdFx0XHQvLyBwb3B1bGF0ZSBtb2RlbCBjYWNoZVxyXG5cdFx0XHRcdC4uLk9iamVjdC5rZXlzKG1hbmlmZXN0Lm1vZGVscyB8fCB7fSkubWFwKGlkID0+IExvYWRlcnMuTW9kZWxQcm9taXNlKG1hbmlmZXN0Lm1vZGVsc1tpZF0pKSxcclxuXHJcblx0XHRcdFx0Ly8gcG9wdWxhdGUgZXhwbGljaXQgdGV4dHVyZSBjYWNoZVxyXG5cdFx0XHRcdC4uLk9iamVjdC5rZXlzKG1hbmlmZXN0LnRleHR1cmVzIHx8IHt9KS5tYXAoaWQgPT4gTG9hZGVycy5UZXh0dXJlUHJvbWlzZShtYW5pZmVzdC50ZXh0dXJlc1tpZF0pKSxcclxuXHJcblx0XHRcdFx0Ly8gZ2VuZXJhdGUgYWxsIHBvc3RlcnNcclxuXHRcdFx0XHQuLi5PYmplY3Qua2V5cyhtYW5pZmVzdC5wb3N0ZXJzIHx8IHt9KS5tYXAoaWQgPT4gTG9hZGVycy5Qb3N0ZXJQcm9taXNlKG1hbmlmZXN0LnBvc3RlcnNbaWRdKSlcclxuXHRcdFx0XSlcclxuXHJcblx0XHRcdC50aGVuKCgpID0+XHJcblx0XHRcdHtcclxuXHRcdFx0XHQvLyBwb3B1bGF0ZSBwYXlsb2FkIGZyb20gY2FjaGVcclxuXHRcdFx0XHR2YXIgcGF5bG9hZCA9IHttb2RlbHM6IHt9LCB0ZXh0dXJlczoge30sIHBvc3RlcnM6IHt9fTtcclxuXHJcblx0XHRcdFx0Zm9yKGxldCBpIGluIG1hbmlmZXN0Lm1vZGVscyl7XHJcblx0XHRcdFx0XHRsZXQgdXJsID0gbWFuaWZlc3QubW9kZWxzW2ldO1xyXG5cdFx0XHRcdFx0bGV0IHQgPSBMb2FkZXJzLl9jYWNoZS5tb2RlbHNbdXJsXTtcclxuXHRcdFx0XHRcdHBheWxvYWQubW9kZWxzW2ldID0gdCA/IHNpbmdsZXRvbnNbdXJsXSA/IHQgOiB0LmNsb25lKCkgOiBudWxsO1xyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0Zm9yKGxldCBpIGluIG1hbmlmZXN0LnRleHR1cmVzKXtcclxuXHRcdFx0XHRcdGxldCB1cmwgPSBtYW5pZmVzdC50ZXh0dXJlc1tpXTtcclxuXHRcdFx0XHRcdGxldCB0ID0gTG9hZGVycy5fY2FjaGUudGV4dHVyZXNbdXJsXTtcclxuXHRcdFx0XHRcdHBheWxvYWQudGV4dHVyZXNbaV0gPSB0ID8gc2luZ2xldG9uc1t1cmxdID8gdCA6IHQuY2xvbmUoKSA6IG51bGw7XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRmb3IobGV0IGkgaW4gbWFuaWZlc3QucG9zdGVycyl7XHJcblx0XHRcdFx0XHRsZXQgdXJsID0gbWFuaWZlc3QucG9zdGVyc1tpXTtcclxuXHRcdFx0XHRcdGxldCB0ID0gTG9hZGVycy5fY2FjaGUucG9zdGVyc1t1cmxdO1xyXG5cdFx0XHRcdFx0cGF5bG9hZC5wb3N0ZXJzW2ldID0gdCA/IHNpbmdsZXRvbnNbdXJsXSA/IHQgOiB0LmNsb25lKCkgOiBudWxsO1xyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0cmVzb2x2ZShwYXlsb2FkKTtcclxuXHRcdFx0fSlcclxuXHRcdFx0LmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihlLnN0YWNrKSk7XHJcblx0XHR9KTtcclxuXHR9XHJcblxyXG59O1xyXG4iXSwibmFtZXMiOlsibGV0IiwibG9hZGVyIiwic3VwZXIiLCJyaWdodCIsIkxvYWRlcnMuX2NhY2hlIiwiTG9hZGVycy5Nb2RlbFByb21pc2UiLCJMb2FkZXJzLlRleHR1cmVQcm9taXNlIiwiTG9hZGVycy5Qb3N0ZXJQcm9taXNlIiwiaSIsInVybCIsInQiXSwibWFwcGluZ3MiOiI7OztBQUVBQSxJQUFJLEtBQUssR0FBRyxDQUFDLE1BQU0sRUFBRSxFQUFFLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUM7O0FBRXBELFNBQVMsWUFBWSxDQUFDLEdBQUc7QUFDekI7Q0FDQyxPQUFPLElBQUksT0FBTyxDQUFDLFVBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRTtFQUVwQyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7R0FDcEIsT0FBTyxPQUFPLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0dBQ2xDOzs7T0FHSSxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7R0FDNUIsR0FBRyxLQUFLLENBQUMsVUFBVSxDQUFDO0lBQ25CQSxJQUFJLE1BQU0sR0FBRyxJQUFJLEtBQUssQ0FBQyxVQUFVLEVBQUUsQ0FBQztJQUNwQyxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxVQUFDLE1BQU0sRUFBRTtLQUN6QixLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUN6RCxPQUFPLE9BQU8sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7S0FDbEMsQ0FBQyxDQUFDO0lBQ0g7UUFDSSxHQUFHLEtBQUssQ0FBQyxVQUFVLENBQUM7SUFDeEJBLElBQUlDLFFBQU0sR0FBRyxJQUFJLEtBQUssQ0FBQyxVQUFVLEVBQUUsQ0FBQztJQUNwQ0Es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
