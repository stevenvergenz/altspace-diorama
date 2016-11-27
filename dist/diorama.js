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
			else {
				console.error(("THREE.glTFLoader not found. \"" + url + "\" not loaded."));
				reject();
			}
		}

		else if(/\.dae$/i.test(url)){
			if(THREE.ColladaLoader){
				var loader$1 = new THREE.ColladaLoader();
				loader$1.load(url, function (result) {
					cache.models[url] = result.scene.children[0];
					return resolve(result.scene.children[0])
				}, null, reject);
			}
			else {
				console.error(("THREE.ColladaLoader not found. \"" + url + "\" not loaded."));
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
				self.env = Object.freeze(Object.assign({}, e, s));
			}
			adjustScale();

			if(fullspace){
				self._fsPromise = e.requestFullspace().catch(function (e) { return console.log('Request for fullspace denied'); });
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
		self.env = Object.freeze({
			innerWidth: 1024,
			innerHeight: 1024,
			innerDepth: 1024,
			pixelsPerMeter: fullspace ? 1 : 1024/3,
			sid: 'browser',
			name: 'browser',
			templateSid: 'browser'
		});

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
		self._skelPromise = altspace.getThreeJSTrackingSkeleton().then(function (skel) {
			self.scene.add(skel);
			self.env.skel = skel;
		});
	}
	else
		{ self._skelPromise = Promise.resolve(); }

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
				root.add( new THREE.AxisHelper(1) );
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
		.catch(function (e) { return console.error(e); });
	});
};

return Diorama;

}());
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjpudWxsLCJzb3VyY2VzIjpbIi4uL3NyYy9sb2FkZXJzLmpzIiwiLi4vc3JjL2NhbWVyYS5qcyIsIi4uL3NyYy9tYWluLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcblxubGV0IGNhY2hlID0ge21vZGVsczoge30sIHRleHR1cmVzOiB7fSwgcG9zdGVyczoge319O1xuXG5mdW5jdGlvbiBNb2RlbFByb21pc2UodXJsKVxue1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT5cblx0e1xuXHRcdGlmKGNhY2hlLm1vZGVsc1t1cmxdKXtcblx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLm1vZGVsc1t1cmxdKTtcblx0XHR9XG5cblx0XHQvLyBOT1RFOiBnbFRGIGxvYWRlciBkb2VzIG5vdCBjYXRjaCBlcnJvcnNcblx0XHRlbHNlIGlmKC9cXC5nbHRmJC9pLnRlc3QodXJsKSl7XG5cdFx0XHRpZihUSFJFRS5nbFRGTG9hZGVyKXtcblx0XHRcdFx0bGV0IGxvYWRlciA9IG5ldyBUSFJFRS5nbFRGTG9hZGVyKCk7XG5cdFx0XHRcdGxvYWRlci5sb2FkKHVybCwgKHJlc3VsdCkgPT4ge1xuXHRcdFx0XHRcdGNhY2hlLm1vZGVsc1t1cmxdID0gcmVzdWx0LnNjZW5lLmNoaWxkcmVuWzBdLmNoaWxkcmVuWzBdO1xuXHRcdFx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLm1vZGVsc1t1cmxdKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0Y29uc29sZS5lcnJvcihgVEhSRUUuZ2xURkxvYWRlciBub3QgZm91bmQuIFwiJHt1cmx9XCIgbm90IGxvYWRlZC5gKTtcblx0XHRcdFx0cmVqZWN0KCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZigvXFwuZGFlJC9pLnRlc3QodXJsKSl7XG5cdFx0XHRpZihUSFJFRS5Db2xsYWRhTG9hZGVyKXtcblx0XHRcdFx0bGV0IGxvYWRlciA9IG5ldyBUSFJFRS5Db2xsYWRhTG9hZGVyKCk7XG5cdFx0XHRcdGxvYWRlci5sb2FkKHVybCwgcmVzdWx0ID0+IHtcblx0XHRcdFx0XHRjYWNoZS5tb2RlbHNbdXJsXSA9IHJlc3VsdC5zY2VuZS5jaGlsZHJlblswXTtcblx0XHRcdFx0XHRyZXR1cm4gcmVzb2x2ZShyZXN1bHQuc2NlbmUuY2hpbGRyZW5bMF0pXG5cdFx0XHRcdH0sIG51bGwsIHJlamVjdCk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0Y29uc29sZS5lcnJvcihgVEhSRUUuQ29sbGFkYUxvYWRlciBub3QgZm91bmQuIFwiJHt1cmx9XCIgbm90IGxvYWRlZC5gKTtcblx0XHRcdFx0cmVqZWN0KCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcbn1cblxuZnVuY3Rpb24gVGV4dHVyZVByb21pc2UodXJsKXtcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XG5cdHtcblx0XHRpZihjYWNoZS50ZXh0dXJlc1t1cmxdKVxuXHRcdFx0cmV0dXJuIHJlc29sdmUoY2FjaGUudGV4dHVyZXNbdXJsXSk7XG5cdFx0ZWxzZSB7XG5cdFx0XHRsZXQgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKTtcblx0XHRcdGxvYWRlci5sb2FkKHVybCwgdGV4dHVyZSA9PiB7XG5cdFx0XHRcdGNhY2hlLnRleHR1cmVzW3VybF0gPSB0ZXh0dXJlO1xuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZSh0ZXh0dXJlKTtcblx0XHRcdH0sIG51bGwsIHJlamVjdCk7XG5cdFx0fVxuXHR9KTtcbn1cblxuY2xhc3MgVmlkZW9Qcm9taXNlIGV4dGVuZHMgUHJvbWlzZSB7XG5cdGNvbnN0cnVjdG9yKHVybClcblx0e1xuXHRcdC8vIHN0YXJ0IGxvYWRlclxuXHRcdHZhciB2aWRTcmMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd2aWRlbycpO1xuXHRcdHZpZFNyYy5hdXRvcGxheSA9IHRydWU7XG5cdFx0dmlkU3JjLmxvb3AgPSB0cnVlO1xuXHRcdHZpZFNyYy5zcmMgPSB1cmw7XG5cdFx0dmlkU3JjLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh2aWRTcmMpO1xuXG5cdFx0dmFyIHRleCA9IG5ldyBUSFJFRS5WaWRlb1RleHR1cmUodmlkU3JjKTtcblx0XHR0ZXgubWluRmlsdGVyID0gVEhSRUUuTGluZWFyRmlsdGVyO1xuXHRcdHRleC5tYWdGaWx0ZXIgPSBUSFJFRS5MaW5lYXJGaWx0ZXI7XG5cdFx0dGV4LmZvcm1hdCA9IFRIUkVFLlJHQkZvcm1hdDtcblxuXHRcdC8vY2FjaGUudmlkZW9zW3VybF0gPSB0ZXg7XG5cdFx0Ly9wYXlsb2FkLnZpZGVvc1tpZF0gPSBjYWNoZS52aWRlb3NbdXJsXTtcblxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGV4KTtcblx0fVxufVxuXG5mdW5jdGlvbiBQb3N0ZXJQcm9taXNlKHVybCl7XG5cdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PlxuXHR7XG5cdFx0aWYoY2FjaGUucG9zdGVyc1t1cmxdKVxuXHRcdFx0cmV0dXJuIHJlc29sdmUoY2FjaGUucG9zdGVyc1t1cmxdKTtcblx0XHRlbHNlIHJldHVybiAobmV3IFRleHR1cmVQcm9taXNlKHVybCkpLnRoZW4odGV4ID0+XG5cdFx0XHR7XG5cdFx0XHRcdGxldCByYXRpbyA9IHRleC5pbWFnZS53aWR0aCAvIHRleC5pbWFnZS5oZWlnaHQ7XG5cdFx0XHRcdGxldCBnZW8sIG1hdCA9IG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7bWFwOiB0ZXgsIHNpZGU6IFRIUkVFLkRvdWJsZVNpZGV9KTtcblxuXHRcdFx0XHRpZihyYXRpbyA+IDEpe1xuXHRcdFx0XHRcdGdlbyA9IG5ldyBUSFJFRS5QbGFuZUdlb21ldHJ5KDEsIDEvcmF0aW8pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdGdlbyA9IG5ldyBUSFJFRS5QbGFuZUdlb21ldHJ5KHJhdGlvLCAxKTtcblx0XHRcdFx0fVxuXHRcdFx0XG5cdFx0XHRcdGNhY2hlLnBvc3RlcnNbdXJsXSA9IG5ldyBUSFJFRS5NZXNoKGdlbywgbWF0KTtcblx0XHRcdFx0cmV0dXJuIHJlc29sdmUoY2FjaGUucG9zdGVyc1t1cmxdKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcbn1cblxuZXhwb3J0IHsgTW9kZWxQcm9taXNlLCBUZXh0dXJlUHJvbWlzZSwgVmlkZW9Qcm9taXNlLCBQb3N0ZXJQcm9taXNlLCBjYWNoZSBhcyBfY2FjaGUgfTtcblxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBQcmV2aWV3Q2FtZXJhIGV4dGVuZHMgVEhSRUUuT3J0aG9ncmFwaGljQ2FtZXJhXG57XG5cdGNvbnN0cnVjdG9yKGZvY3VzLCB2aWV3U2l6ZSwgbG9va0RpcmVjdGlvbilcblx0e1xuXHRcdHN1cGVyKC0xLCAxLCAxLCAtMSwgLjEsIDQwMCk7XG5cblx0XHRsZXQgc2V0dGluZ3MgPSB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2Rpb3JhbWFWaWV3U2V0dGluZ3MnKTtcblx0XHRpZihzZXR0aW5ncyl7XG5cdFx0XHRzZXR0aW5ncyA9IEpTT04ucGFyc2Uoc2V0dGluZ3MpO1xuXHRcdFx0aWYoIWZvY3VzKVxuXHRcdFx0XHRmb2N1cyA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuZnJvbUFycmF5KHNldHRpbmdzLmZvY3VzKTtcblx0XHRcdGlmKCF2aWV3U2l6ZSlcblx0XHRcdFx0dmlld1NpemUgPSBzZXR0aW5ncy52aWV3U2l6ZTtcblx0XHRcdGlmKCFsb29rRGlyZWN0aW9uKVxuXHRcdFx0XHRsb29rRGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5mcm9tQXJyYXkoc2V0dGluZ3MubG9va0RpcmVjdGlvbik7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdmlld1NpemUgPSB2aWV3U2l6ZSB8fCA0MDtcblx0XHR0aGlzLl9mb2N1cyA9IGZvY3VzIHx8IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG5cdFx0dGhpcy5fbG9va0RpcmVjdGlvbiA9IGxvb2tEaXJlY3Rpb24gfHwgbmV3IFRIUkVFLlZlY3RvcjMoMCwtMSwwKTtcblx0XHR0aGlzLmdyaWRIZWxwZXIgPSBuZXcgVEhSRUUuR3JpZEhlbHBlcigzMDAsIDEpO1xuXHRcdC8vdGhpcy5ncmlkSGVscGVyLnF1YXRlcm5pb24uc2V0RnJvbVVuaXRWZWN0b3JzKCBuZXcgVEhSRUUuVmVjdG9yMygwLC0xLDApLCB0aGlzLl9sb29rRGlyZWN0aW9uICk7XG5cdH1cblxuXHRnZXQgdmlld1NpemUoKXtcblx0XHRyZXR1cm4gdGhpcy5fdmlld1NpemU7XG5cdH1cblx0c2V0IHZpZXdTaXplKHZhbCl7XG5cdFx0dGhpcy5fdmlld1NpemUgPSB2YWw7XG5cdFx0dGhpcy5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXHR9XG5cblx0Z2V0IGZvY3VzKCl7XG5cdFx0cmV0dXJuIHRoaXMuX2ZvY3VzO1xuXHR9XG5cdHNldCBmb2N1cyh2YWwpe1xuXHRcdHRoaXMuX2ZvY3VzLmNvcHkodmFsKTtcblx0XHR0aGlzLnJlY29tcHV0ZVZpZXdwb3J0KCk7XG5cdH1cblxuXHRnZXQgbG9va0RpcmVjdGlvbigpe1xuXHRcdHJldHVybiB0aGlzLl9sb29rRGlyZWN0aW9uO1xuXHR9XG5cdHNldCBsb29rRGlyZWN0aW9uKHZhbCl7XG5cdFx0dGhpcy5fbG9va0RpcmVjdGlvbi5jb3B5KHZhbCk7XG5cdFx0dGhpcy5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXHR9XG5cblx0cmVnaXN0ZXJIb29rcyhyZW5kZXJlcilcblx0e1xuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRzZWxmLnJlbmRlcmVyID0gcmVuZGVyZXI7XG5cblx0XHQvLyBzZXQgc3R5bGVzIG9uIHRoZSBwYWdlLCBzbyB0aGUgcHJldmlldyB3b3JrcyByaWdodFxuXHRcdGRvY3VtZW50LmJvZHkucGFyZW50RWxlbWVudC5zdHlsZS5oZWlnaHQgPSAnMTAwJSc7XG5cdFx0ZG9jdW1lbnQuYm9keS5zdHlsZS5oZWlnaHQgPSAnMTAwJSc7XG5cdFx0ZG9jdW1lbnQuYm9keS5zdHlsZS5tYXJnaW4gPSAnMCc7XG5cdFx0ZG9jdW1lbnQuYm9keS5zdHlsZS5vdmVyZmxvdyA9ICdoaWRkZW4nO1xuXG5cdFx0dmFyIGluZm8gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJyk7XG5cdFx0aW5mby5pbm5lckhUTUwgPSBbJ01pZGRsZSBjbGljayBhbmQgZHJhZyB0byBwYW4nLCAnTW91c2Ugd2hlZWwgdG8gem9vbScsICdBcnJvdyBrZXlzIHRvIHJvdGF0ZSddLmpvaW4oJzxici8+Jyk7XG5cdFx0T2JqZWN0LmFzc2lnbihpbmZvLnN0eWxlLCB7XG5cdFx0XHRwb3NpdGlvbjogJ2ZpeGVkJyxcblx0XHRcdHRvcDogJzEwcHgnLFxuXHRcdFx0bGVmdDogJzEwcHgnLFxuXHRcdFx0bWFyZ2luOiAwXG5cdFx0fSk7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChpbmZvKTtcblxuXHRcdC8vIHJlc2l6ZSB0aGUgcHJldmlldyBjYW52YXMgd2hlbiB3aW5kb3cgcmVzaXplc1xuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCBlID0+IHNlbGYucmVjb21wdXRlVmlld3BvcnQoKSk7XG5cdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXG5cdFx0Ly8gbWlkZGxlIGNsaWNrIGFuZCBkcmFnIHRvIHBhbiB2aWV3XG5cdFx0dmFyIGRyYWdTdGFydCA9IG51bGwsIGZvY3VzU3RhcnQgPSBudWxsO1xuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBlID0+IHtcblx0XHRcdGlmKGUuYnV0dG9uID09PSAxKXtcblx0XHRcdFx0ZHJhZ1N0YXJ0ID0ge3g6IGUuY2xpZW50WCwgeTogZS5jbGllbnRZfTtcblx0XHRcdFx0Zm9jdXNTdGFydCA9IHNlbGYuX2ZvY3VzLmNsb25lKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCBlID0+IHtcblx0XHRcdGlmKGUuYnV0dG9uID09PSAxKXtcblx0XHRcdFx0ZHJhZ1N0YXJ0ID0gbnVsbDtcblx0XHRcdFx0Zm9jdXNTdGFydCA9IG51bGw7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIGUgPT4ge1xuXHRcdFx0aWYoZHJhZ1N0YXJ0KVxuXHRcdFx0e1xuXHRcdFx0XHRsZXQge2NsaWVudFdpZHRoOiB3LCBjbGllbnRIZWlnaHQ6IGh9ID0gZG9jdW1lbnQuYm9keTtcblx0XHRcdFx0bGV0IHBpeGVsc1Blck1ldGVyID0gTWF0aC5zcXJ0KHcqdytoKmgpIC8gc2VsZi5fdmlld1NpemU7XG5cdFx0XHRcdGxldCBkeCA9IGUuY2xpZW50WCAtIGRyYWdTdGFydC54LCBkeSA9IGUuY2xpZW50WSAtIGRyYWdTdGFydC55O1xuXHRcdFx0XHRsZXQgcmlnaHQgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmNyb3NzVmVjdG9ycyhzZWxmLl9sb29rRGlyZWN0aW9uLCBzZWxmLnVwKTtcblxuXHRcdFx0XHRzZWxmLl9mb2N1cy5jb3B5KGZvY3VzU3RhcnQpXG5cdFx0XHRcdFx0LmFkZChzZWxmLnVwLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoZHkvcGl4ZWxzUGVyTWV0ZXIpKVxuXHRcdFx0XHRcdC5hZGQocmlnaHQubXVsdGlwbHlTY2FsYXIoLWR4L3BpeGVsc1Blck1ldGVyKSk7XG5cblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gd2hlZWwgdG8gem9vbVxuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCd3aGVlbCcsIGUgPT4ge1xuXHRcdFx0aWYoZS5kZWx0YVkgPCAwKXtcblx0XHRcdFx0c2VsZi5fdmlld1NpemUgKj0gMC45MDtcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZihlLmRlbHRhWSA+IDApe1xuXHRcdFx0XHRzZWxmLl92aWV3U2l6ZSAqPSAxLjE7XG5cdFx0XHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIGFycm93IGtleXMgdG8gcm90YXRlXG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBlID0+IHtcblx0XHRcdGlmKGUua2V5ID09PSAnQXJyb3dEb3duJyl7XG5cdFx0XHRcdGxldCByaWdodCA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuY3Jvc3NWZWN0b3JzKHNlbGYuX2xvb2tEaXJlY3Rpb24sIHNlbGYudXApO1xuXHRcdFx0XHRzZWxmLl9sb29rRGlyZWN0aW9uLmFwcGx5QXhpc0FuZ2xlKHJpZ2h0LCBNYXRoLlBJLzIpO1xuXHRcdFx0XHQvL3NlbGYuZ3JpZEhlbHBlci5yb3RhdGVPbkF4aXMocmlnaHQsIE1hdGguUEkvMik7XG5cdFx0XHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcblx0XHRcdH1cblx0XHRcdGVsc2UgaWYoZS5rZXkgPT09ICdBcnJvd1VwJyl7XG5cdFx0XHRcdGxldCByaWdodCA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuY3Jvc3NWZWN0b3JzKHNlbGYuX2xvb2tEaXJlY3Rpb24sIHNlbGYudXApO1xuXHRcdFx0XHRzZWxmLl9sb29rRGlyZWN0aW9uLmFwcGx5QXhpc0FuZ2xlKHJpZ2h0LCAtTWF0aC5QSS8yKTtcblx0XHRcdFx0Ly9zZWxmLmdyaWRIZWxwZXIucm90YXRlT25BeGlzKHJpZ2h0LCAtTWF0aC5QSS8yKTtcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmKGUua2V5ID09PSAnQXJyb3dMZWZ0Jyl7XG5cdFx0XHRcdHNlbGYuX2xvb2tEaXJlY3Rpb24uYXBwbHlBeGlzQW5nbGUoc2VsZi51cCwgLU1hdGguUEkvMik7XG5cdFx0XHRcdC8vc2VsZi5ncmlkSGVscGVyLnJvdGF0ZU9uQXhpcyhzZWxmLnVwLCAtTWF0aC5QSS8yKTtcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZihlLmtleSA9PT0gJ0Fycm93UmlnaHQnKXtcblx0XHRcdFx0c2VsZi5fbG9va0RpcmVjdGlvbi5hcHBseUF4aXNBbmdsZShzZWxmLnVwLCBNYXRoLlBJLzIpO1xuXHRcdFx0XHQvL3NlbGYuZ3JpZEhlbHBlci5yb3RhdGVPbkF4aXMoc2VsZi51cCwgTWF0aC5QSS8yKTtcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cmVjb21wdXRlVmlld3BvcnQoKVxuXHR7XG5cdFx0dmFyIHtjbGllbnRXaWR0aDogdywgY2xpZW50SGVpZ2h0OiBofSA9IGRvY3VtZW50LmJvZHk7XG5cblx0XHQvLyByZXNpemUgY2FudmFzXG5cdFx0dGhpcy5yZW5kZXJlci5zZXRTaXplKHcsIGgpO1xuXG5cdFx0Ly8gY29tcHV0ZSB3aW5kb3cgZGltZW5zaW9ucyBmcm9tIHZpZXcgc2l6ZVxuXHRcdHZhciByYXRpbyA9IHcvaDtcblx0XHR2YXIgaGVpZ2h0ID0gTWF0aC5zcXJ0KCAodGhpcy5fdmlld1NpemUqdGhpcy5fdmlld1NpemUpIC8gKHJhdGlvKnJhdGlvICsgMSkgKTtcblx0XHR2YXIgd2lkdGggPSByYXRpbyAqIGhlaWdodDtcblxuXHRcdC8vIHNldCBmcnVzdHJ1bSBlZGdlc1xuXHRcdHRoaXMubGVmdCA9IC13aWR0aC8yO1xuXHRcdHRoaXMucmlnaHQgPSB3aWR0aC8yO1xuXHRcdHRoaXMudG9wID0gaGVpZ2h0LzI7XG5cdFx0dGhpcy5ib3R0b20gPSAtaGVpZ2h0LzI7XG5cblx0XHR0aGlzLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcblxuXHRcdC8vIHVwZGF0ZSBwb3NpdGlvblxuXHRcdHRoaXMucG9zaXRpb24uY29weSh0aGlzLl9mb2N1cykuc3ViKCB0aGlzLl9sb29rRGlyZWN0aW9uLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoMjAwKSApO1xuXHRcdGlmKCBNYXRoLmFicyggdGhpcy5fbG9va0RpcmVjdGlvbi5ub3JtYWxpemUoKS5kb3QobmV3IFRIUkVFLlZlY3RvcjMoMCwtMSwwKSkgKSA9PT0gMSApXG5cdFx0XHR0aGlzLnVwLnNldCgwLDAsMSk7IC8vIGlmIHdlJ3JlIGxvb2tpbmcgZG93biB0aGUgWSBheGlzXG5cdFx0ZWxzZVxuXHRcdFx0dGhpcy51cC5zZXQoMCwxLDApO1xuXHRcdHRoaXMubG9va0F0KCB0aGlzLl9mb2N1cyApO1xuXG5cdFx0d2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKCdkaW9yYW1hVmlld1NldHRpbmdzJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0Zm9jdXM6IHRoaXMuX2ZvY3VzLnRvQXJyYXkoKSxcblx0XHRcdHZpZXdTaXplOiB0aGlzLl92aWV3U2l6ZSxcblx0XHRcdGxvb2tEaXJlY3Rpb246IHRoaXMuX2xvb2tEaXJlY3Rpb24udG9BcnJheSgpXG5cdFx0fSkpO1xuXHR9XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbmltcG9ydCAqIGFzIExvYWRlcnMgZnJvbSAnLi9sb2FkZXJzJztcbmltcG9ydCBQcmV2aWV3Q2FtZXJhIGZyb20gJy4vY2FtZXJhJztcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRGlvcmFtYVxue1xuXHRjb25zdHJ1Y3Rvcih7YmdDb2xvcj0weGFhYWFhYSwgZ3JpZE9mZnNldD1bMCwwLDBdLCBmdWxsc3BhY2U9ZmFsc2V9ID0ge30pXG5cdHtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0c2VsZi5fY2FjaGUgPSBMb2FkZXJzLl9jYWNoZTtcblx0XHRzZWxmLnNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XG5cblx0XHQvLyBzZXQgdXAgcmVuZGVyZXIgYW5kIHNjYWxlXG5cdFx0aWYoYWx0c3BhY2UuaW5DbGllbnQpXG5cdFx0e1xuXHRcdFx0c2VsZi5yZW5kZXJlciA9IGFsdHNwYWNlLmdldFRocmVlSlNSZW5kZXJlcigpO1xuXHRcdFx0c2VsZi5fZW52UHJvbWlzZSA9IFByb21pc2UuYWxsKFthbHRzcGFjZS5nZXRFbmNsb3N1cmUoKSwgYWx0c3BhY2UuZ2V0U3BhY2UoKV0pXG5cdFx0XHQudGhlbigoW2UsIHNdKSA9PiB7XG5cblx0XHRcdFx0ZnVuY3Rpb24gYWRqdXN0U2NhbGUoKXtcblx0XHRcdFx0XHRzZWxmLnNjZW5lLnNjYWxlLnNldFNjYWxhcihlLnBpeGVsc1Blck1ldGVyKTtcblx0XHRcdFx0XHRzZWxmLmVudiA9IE9iamVjdC5mcmVlemUoT2JqZWN0LmFzc2lnbih7fSwgZSwgcykpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkanVzdFNjYWxlKCk7XG5cblx0XHRcdFx0aWYoZnVsbHNwYWNlKXtcblx0XHRcdFx0XHRzZWxmLl9mc1Byb21pc2UgPSBlLnJlcXVlc3RGdWxsc3BhY2UoKS5jYXRjaCgoZSkgPT4gY29uc29sZS5sb2coJ1JlcXVlc3QgZm9yIGZ1bGxzcGFjZSBkZW5pZWQnKSk7XG5cdFx0XHRcdFx0ZS5hZGRFdmVudExpc3RlbmVyKCdmdWxsc3BhY2VjaGFuZ2UnLCBhZGp1c3RTY2FsZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZVxuXHRcdFx0XHRcdHNlbGYuX2ZzUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGVsc2Vcblx0XHR7XG5cdFx0XHQvLyBzZXQgdXAgcHJldmlldyByZW5kZXJlciwgaW4gY2FzZSB3ZSdyZSBvdXQgb2Ygd29ybGRcblx0XHRcdHNlbGYucmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcigpO1xuXHRcdFx0c2VsZi5yZW5kZXJlci5zZXRTaXplKGRvY3VtZW50LmJvZHkuY2xpZW50V2lkdGgsIGRvY3VtZW50LmJvZHkuY2xpZW50SGVpZ2h0KTtcblx0XHRcdHNlbGYucmVuZGVyZXIuc2V0Q2xlYXJDb2xvciggYmdDb2xvciApO1xuXHRcdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChzZWxmLnJlbmRlcmVyLmRvbUVsZW1lbnQpO1xuXG5cdFx0XHRzZWxmLnByZXZpZXdDYW1lcmEgPSBuZXcgUHJldmlld0NhbWVyYSgpO1xuXHRcdFx0c2VsZi5wcmV2aWV3Q2FtZXJhLmdyaWRIZWxwZXIucG9zaXRpb24uZnJvbUFycmF5KGdyaWRPZmZzZXQpO1xuXHRcdFx0c2VsZi5zY2VuZS5hZGQoc2VsZi5wcmV2aWV3Q2FtZXJhLCBzZWxmLnByZXZpZXdDYW1lcmEuZ3JpZEhlbHBlcik7XG5cdFx0XHRzZWxmLnByZXZpZXdDYW1lcmEucmVnaXN0ZXJIb29rcyhzZWxmLnJlbmRlcmVyKTtcblxuXHRcdFx0Ly8gc2V0IHVwIGN1cnNvciBlbXVsYXRpb25cblx0XHRcdGFsdHNwYWNlLnV0aWxpdGllcy5zaGltcy5jdXJzb3IuaW5pdChzZWxmLnNjZW5lLCBzZWxmLnByZXZpZXdDYW1lcmEsIHtyZW5kZXJlcjogc2VsZi5yZW5kZXJlcn0pO1xuXG5cdFx0XHQvLyBzdHViIGVudmlyb25tZW50XG5cdFx0XHRzZWxmLmVudiA9IE9iamVjdC5mcmVlemUoe1xuXHRcdFx0XHRpbm5lcldpZHRoOiAxMDI0LFxuXHRcdFx0XHRpbm5lckhlaWdodDogMTAyNCxcblx0XHRcdFx0aW5uZXJEZXB0aDogMTAyNCxcblx0XHRcdFx0cGl4ZWxzUGVyTWV0ZXI6IGZ1bGxzcGFjZSA/IDEgOiAxMDI0LzMsXG5cdFx0XHRcdHNpZDogJ2Jyb3dzZXInLFxuXHRcdFx0XHRuYW1lOiAnYnJvd3NlcicsXG5cdFx0XHRcdHRlbXBsYXRlU2lkOiAnYnJvd3Nlcidcblx0XHRcdH0pO1xuXG5cdFx0XHRzZWxmLl9lbnZQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRzZWxmLl9mc1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cdH1cblxuXG5cdHN0YXJ0KC4uLm1vZHVsZXMpXG5cdHtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0XHQvLyBkZXRlcm1pbmUgd2hpY2ggYXNzZXRzIGFyZW4ndCBzaGFyZWRcblx0XHR2YXIgc2luZ2xldG9ucyA9IHt9O1xuXHRcdG1vZHVsZXMuZm9yRWFjaChtb2QgPT5cblx0XHR7XG5cdFx0XHRmdW5jdGlvbiBjaGVja0Fzc2V0KHVybCl7XG5cdFx0XHRcdGlmKHNpbmdsZXRvbnNbdXJsXSA9PT0gdW5kZWZpbmVkKSBzaW5nbGV0b25zW3VybF0gPSB0cnVlO1xuXHRcdFx0XHRlbHNlIGlmKHNpbmdsZXRvbnNbdXJsXSA9PT0gdHJ1ZSkgc2luZ2xldG9uc1t1cmxdID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRPYmplY3Qua2V5cyhtb2QuYXNzZXRzLnRleHR1cmVzIHx8IHt9KS5tYXAoayA9PiBtb2QuYXNzZXRzLnRleHR1cmVzW2tdKS5mb3JFYWNoKGNoZWNrQXNzZXQpO1xuXHRcdFx0T2JqZWN0LmtleXMobW9kLmFzc2V0cy5tb2RlbHMgfHwge30pLm1hcChrID0+IG1vZC5hc3NldHMubW9kZWxzW2tdKS5mb3JFYWNoKGNoZWNrQXNzZXQpO1xuXHRcdFx0T2JqZWN0LmtleXMobW9kLmFzc2V0cy5wb3N0ZXJzIHx8IHt9KS5tYXAoayA9PiBtb2QuYXNzZXRzLnBvc3RlcnNba10pLmZvckVhY2goY2hlY2tBc3NldCk7XG5cdFx0fSk7XG5cblx0XHQvLyBkZXRlcm1pbmUgaWYgdGhlIHRyYWNraW5nIHNrZWxldG9uIGlzIG5lZWRlZFxuXHRcdGxldCBuZWVkc1NrZWxldG9uID0gbW9kdWxlcy5yZWR1Y2UoKG5zLG0pID0+IG5zIHx8IG0ubmVlZHNTa2VsZXRvbiwgZmFsc2UpO1xuXHRcdGlmKG5lZWRzU2tlbGV0b24gJiYgYWx0c3BhY2UuaW5DbGllbnQpe1xuXHRcdFx0c2VsZi5fc2tlbFByb21pc2UgPSBhbHRzcGFjZS5nZXRUaHJlZUpTVHJhY2tpbmdTa2VsZXRvbigpLnRoZW4oc2tlbCA9PiB7XG5cdFx0XHRcdHNlbGYuc2NlbmUuYWRkKHNrZWwpO1xuXHRcdFx0XHRzZWxmLmVudi5za2VsID0gc2tlbDtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRlbHNlXG5cdFx0XHRzZWxmLl9za2VsUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0UHJvbWlzZS5hbGwoW3NlbGYuX2VudlByb21pc2UsIHNlbGYuX2ZzUHJvbWlzZSwgc2VsZi5fc2tlbFByb21pc2VdKS50aGVuKCgpID0+XG5cdFx0e1xuXHRcdFx0Ly8gY29uc3RydWN0IGRpb3JhbWFzXG5cdFx0XHRtb2R1bGVzLmZvckVhY2goZnVuY3Rpb24obW9kdWxlKVxuXHRcdFx0e1xuXHRcdFx0XHRsZXQgcm9vdCA9IG51bGw7XG5cblx0XHRcdFx0aWYobW9kdWxlIGluc3RhbmNlb2YgVEhSRUUuT2JqZWN0M0Qpe1xuXHRcdFx0XHRcdHJvb3QgPSBtb2R1bGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZVxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cm9vdCA9IG5ldyBUSFJFRS5PYmplY3QzRCgpO1xuXG5cdFx0XHRcdFx0Ly8gaGFuZGxlIGFic29sdXRlIHBvc2l0aW9uaW5nXG5cdFx0XHRcdFx0aWYobW9kdWxlLnRyYW5zZm9ybSl7XG5cdFx0XHRcdFx0XHRyb290Lm1hdHJpeC5mcm9tQXJyYXkobW9kdWxlLnRyYW5zZm9ybSk7XG5cdFx0XHRcdFx0XHRyb290Lm1hdHJpeC5kZWNvbXBvc2Uocm9vdC5wb3NpdGlvbiwgcm9vdC5xdWF0ZXJuaW9uLCByb290LnNjYWxlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHRpZihtb2R1bGUucG9zaXRpb24pe1xuXHRcdFx0XHRcdFx0XHRyb290LnBvc2l0aW9uLmZyb21BcnJheShtb2R1bGUucG9zaXRpb24pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYobW9kdWxlLnJvdGF0aW9uKXtcblx0XHRcdFx0XHRcdFx0cm9vdC5yb3RhdGlvbi5mcm9tQXJyYXkobW9kdWxlLnJvdGF0aW9uKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBoYW5kbGUgcmVsYXRpdmUgcG9zaXRpb25pbmdcblx0XHRcdFx0aWYobW9kdWxlLnZlcnRpY2FsQWxpZ24pe1xuXHRcdFx0XHRcdGxldCBoYWxmSGVpZ2h0ID0gc2VsZi5lbnYuaW5uZXJIZWlnaHQvKDIqc2VsZi5lbnYucGl4ZWxzUGVyTWV0ZXIpO1xuXHRcdFx0XHRcdHN3aXRjaChtb2R1bGUudmVydGljYWxBbGlnbil7XG5cdFx0XHRcdFx0Y2FzZSAndG9wJzpcblx0XHRcdFx0XHRcdHJvb3QudHJhbnNsYXRlWShoYWxmSGVpZ2h0KTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2JvdHRvbSc6XG5cdFx0XHRcdFx0XHRyb290LnRyYW5zbGF0ZVkoLWhhbGZIZWlnaHQpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnbWlkZGxlJzpcblx0XHRcdFx0XHRcdC8vIGRlZmF1bHRcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRjb25zb2xlLndhcm4oJ0ludmFsaWQgdmFsdWUgZm9yIFwidmVydGljYWxBbGlnblwiIC0gJywgbW9kdWxlLnZlcnRpY2FsQWxpZ24pO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0c2VsZi5zY2VuZS5hZGQocm9vdCk7XG5cblx0XHRcdFx0aWYoc2VsZi5wcmV2aWV3Q2FtZXJhKXtcblx0XHRcdFx0XHRyb290LmFkZCggbmV3IFRIUkVFLkF4aXNIZWxwZXIoMSkgKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHNlbGYubG9hZEFzc2V0cyhtb2R1bGUuYXNzZXRzLCBzaW5nbGV0b25zKS50aGVuKChyZXN1bHRzKSA9PiB7XG5cdFx0XHRcdFx0bW9kdWxlLmluaXRpYWxpemUoc2VsZi5lbnYsIHJvb3QsIHJlc3VsdHMpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0Ly8gc3RhcnQgYW5pbWF0aW5nXG5cdFx0d2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZShmdW5jdGlvbiBhbmltYXRlKHRpbWVzdGFtcClcblx0XHR7XG5cdFx0XHR3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKGFuaW1hdGUpO1xuXHRcdFx0c2VsZi5zY2VuZS51cGRhdGVBbGxCZWhhdmlvcnMoKTtcblx0XHRcdGlmKHdpbmRvdy5UV0VFTikgVFdFRU4udXBkYXRlKCk7XG5cdFx0XHRzZWxmLnJlbmRlcmVyLnJlbmRlcihzZWxmLnNjZW5lLCBzZWxmLnByZXZpZXdDYW1lcmEpO1xuXHRcdH0pO1xuXHR9XG5cblx0bG9hZEFzc2V0cyhtYW5pZmVzdCwgc2luZ2xldG9ucylcblx0e1xuXHRcdHZhciBzZWxmID0gdGhpcztcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PlxuXHRcdHtcblx0XHRcdC8vIHBvcHVsYXRlIGNhY2hlXG5cdFx0XHRQcm9taXNlLmFsbChbXG5cblx0XHRcdFx0Ly8gcG9wdWxhdGUgbW9kZWwgY2FjaGVcblx0XHRcdFx0Li4uT2JqZWN0LmtleXMobWFuaWZlc3QubW9kZWxzIHx8IHt9KS5tYXAoaWQgPT4gTG9hZGVycy5Nb2RlbFByb21pc2UobWFuaWZlc3QubW9kZWxzW2lkXSkpLFxuXG5cdFx0XHRcdC8vIHBvcHVsYXRlIGV4cGxpY2l0IHRleHR1cmUgY2FjaGVcblx0XHRcdFx0Li4uT2JqZWN0LmtleXMobWFuaWZlc3QudGV4dHVyZXMgfHwge30pLm1hcChpZCA9PiBMb2FkZXJzLlRleHR1cmVQcm9taXNlKG1hbmlmZXN0LnRleHR1cmVzW2lkXSkpLFxuXG5cdFx0XHRcdC8vIGdlbmVyYXRlIGFsbCBwb3N0ZXJzXG5cdFx0XHRcdC4uLk9iamVjdC5rZXlzKG1hbmlmZXN0LnBvc3RlcnMgfHwge30pLm1hcChpZCA9PiBMb2FkZXJzLlBvc3RlclByb21pc2UobWFuaWZlc3QucG9zdGVyc1tpZF0pKVxuXHRcdFx0XSlcblxuXHRcdFx0LnRoZW4oKCkgPT5cblx0XHRcdHtcblx0XHRcdFx0Ly8gcG9wdWxhdGUgcGF5bG9hZCBmcm9tIGNhY2hlXG5cdFx0XHRcdHZhciBwYXlsb2FkID0ge21vZGVsczoge30sIHRleHR1cmVzOiB7fSwgcG9zdGVyczoge319O1xuXG5cdFx0XHRcdGZvcihsZXQgaSBpbiBtYW5pZmVzdC5tb2RlbHMpe1xuXHRcdFx0XHRcdGxldCB1cmwgPSBtYW5pZmVzdC5tb2RlbHNbaV07XG5cdFx0XHRcdFx0bGV0IHQgPSBMb2FkZXJzLl9jYWNoZS5tb2RlbHNbdXJsXTtcblx0XHRcdFx0XHRwYXlsb2FkLm1vZGVsc1tpXSA9IHQgPyBzaW5nbGV0b25zW3VybF0gPyB0IDogdC5jbG9uZSgpIDogbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvcihsZXQgaSBpbiBtYW5pZmVzdC50ZXh0dXJlcyl7XG5cdFx0XHRcdFx0bGV0IHVybCA9IG1hbmlmZXN0LnRleHR1cmVzW2ldO1xuXHRcdFx0XHRcdGxldCB0ID0gTG9hZGVycy5fY2FjaGUudGV4dHVyZXNbdXJsXTtcblx0XHRcdFx0XHRwYXlsb2FkLnRleHR1cmVzW2ldID0gdCA/IHNpbmdsZXRvbnNbdXJsXSA/IHQgOiB0LmNsb25lKCkgOiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Zm9yKGxldCBpIGluIG1hbmlmZXN0LnBvc3RlcnMpe1xuXHRcdFx0XHRcdGxldCB1cmwgPSBtYW5pZmVzdC5wb3N0ZXJzW2ldO1xuXHRcdFx0XHRcdGxldCB0ID0gTG9hZGVycy5fY2FjaGUucG9zdGVyc1t1cmxdO1xuXHRcdFx0XHRcdHBheWxvYWQucG9zdGVyc1tpXSA9IHQgPyBzaW5nbGV0b25zW3VybF0gPyB0IDogdC5jbG9uZSgpIDogbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJlc29sdmUocGF5bG9hZCk7XG5cdFx0XHR9KVxuXHRcdFx0LmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihlKSk7XG5cdFx0fSk7XG5cdH1cblxufTtcbiJdLCJuYW1lcyI6WyJsZXQiLCJsb2FkZXIiLCJzdXBlciIsInJpZ2h0IiwiTG9hZGVycy5fY2FjaGUiLCJMb2FkZXJzLk1vZGVsUHJvbWlzZSIsIkxvYWRlcnMuVGV4dHVyZVByb21pc2UiLCJMb2FkZXJzLlBvc3RlclByb21pc2UiLCJpIiwidXJsIiwidCJdLCJtYXBwaW5ncyI6Ijs7O0FBRUFBLElBQUksS0FBSyxHQUFHLENBQUMsTUFBTSxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQzs7QUFFcEQsU0FBUyxZQUFZLENBQUMsR0FBRztBQUN6QjtDQUNDLE9BQU8sSUFBSSxPQUFPLENBQUMsVUFBQyxPQUFPLEVBQUUsTUFBTSxFQUFFO0VBRXBDLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztHQUNwQixPQUFPLE9BQU8sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7R0FDbEM7OztPQUdJLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztHQUM1QixHQUFHLEtBQUssQ0FBQyxVQUFVLENBQUM7SUFDbkJBLElBQUksTUFBTSxHQUFHLElBQUksS0FBSyxDQUFDLFVBQVUsRUFBRSxDQUFDO0lBQ3BDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLFVBQUMsTUFBTSxFQUFFO0tBQ3pCLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO0tBQ3pELE9BQU8sT0FBTyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztLQUNsQyxDQUFDLENBQUM7SUFDSDtRQUNJO0lBQ0osT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFBLGdDQUE4QixHQUFFLEdBQUcsbUJBQWMsQ0FBQyxDQUFDLENBQUM7SUFDbEUsTUFBTSxFQUFFLENBQUM7SUFDVDtHQUNEOztPQUVJLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztHQUMzQixH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
