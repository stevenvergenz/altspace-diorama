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
					console.log(result);
					cache.models[url] = result.scene.children[0];
					return resolve(cache.models[url]);
				}, null, reject);
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
		.then(function(ref){
			var e = ref[0];
			var s = ref[1];

			self.env = Object.freeze(Object.assign({}, e, s));
			self.scene.scale.multiplyScalar(e.pixelsPerMeter);

			if(fullspace){
				e.requestFullspace().catch(function (e) { return console.log('Request for fullspace denied'); });
			}
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
		Object.keys(mod.assets.posters || {}).map(function (k) { return mod.assets.posters[k]; }).forEach(checkAsset);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjpudWxsLCJzb3VyY2VzIjpbIi4uL3NyYy9sb2FkZXJzLmpzIiwiLi4vc3JjL2NhbWVyYS5qcyIsIi4uL3NyYy9tYWluLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcclxuXHJcbmxldCBjYWNoZSA9IHttb2RlbHM6IHt9LCB0ZXh0dXJlczoge30sIHBvc3RlcnM6IHt9fTtcclxuXHJcbmZ1bmN0aW9uIE1vZGVsUHJvbWlzZSh1cmwpXHJcbntcclxuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT5cclxuXHR7XHJcblx0XHRpZihjYWNoZS5tb2RlbHNbdXJsXSl7XHJcblx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLm1vZGVsc1t1cmxdKTtcclxuXHRcdH1cclxuXHJcblx0XHQvLyBOT1RFOiBnbFRGIGxvYWRlciBkb2VzIG5vdCBjYXRjaCBlcnJvcnNcclxuXHRcdGVsc2UgaWYoL1xcLmdsdGYkL2kudGVzdCh1cmwpKXtcclxuXHRcdFx0aWYoVEhSRUUuZ2xURkxvYWRlcil7XHJcblx0XHRcdFx0bGV0IGxvYWRlciA9IG5ldyBUSFJFRS5nbFRGTG9hZGVyKCk7XHJcblx0XHRcdFx0bG9hZGVyLmxvYWQodXJsLCAocmVzdWx0KSA9PiB7XHJcblx0XHRcdFx0XHRjYWNoZS5tb2RlbHNbdXJsXSA9IHJlc3VsdC5zY2VuZS5jaGlsZHJlblswXS5jaGlsZHJlblswXTtcclxuXHRcdFx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLm1vZGVsc1t1cmxdKTtcclxuXHRcdFx0XHR9KTtcclxuXHRcdFx0fVxyXG5cdFx0XHRlbHNlIGlmKFRIUkVFLkdMVEZMb2FkZXIpe1xyXG5cdFx0XHRcdGxldCBsb2FkZXIgPSBuZXcgVEhSRUUuR0xURkxvYWRlcigpO1xyXG5cdFx0XHRcdGxvYWRlci5sb2FkKHVybCwgcmVzdWx0ID0+IHtcclxuXHRcdFx0XHRcdGNvbnNvbGUubG9nKHJlc3VsdCk7XHJcblx0XHRcdFx0XHRjYWNoZS5tb2RlbHNbdXJsXSA9IHJlc3VsdC5zY2VuZS5jaGlsZHJlblswXTtcclxuXHRcdFx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLm1vZGVsc1t1cmxdKTtcclxuXHRcdFx0XHR9LCBudWxsLCByZWplY3QpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoYGdsVEYgbG9hZGVyIG5vdCBmb3VuZC4gXCIke3VybH1cIiBub3QgbG9hZGVkLmApO1xyXG5cdFx0XHRcdHJlamVjdCgpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cdFx0ZWxzZSBpZigvXFwuZGFlJC9pLnRlc3QodXJsKSl7XHJcblx0XHRcdGlmKFRIUkVFLkNvbGxhZGFMb2FkZXIpe1xyXG5cdFx0XHRcdGxldCBsb2FkZXIgPSBuZXcgVEhSRUUuQ29sbGFkYUxvYWRlcigpO1xyXG5cdFx0XHRcdGxvYWRlci5sb2FkKHVybCwgcmVzdWx0ID0+IHtcclxuXHRcdFx0XHRcdGNhY2hlLm1vZGVsc1t1cmxdID0gcmVzdWx0LnNjZW5lLmNoaWxkcmVuWzBdO1xyXG5cdFx0XHRcdFx0cmV0dXJuIHJlc29sdmUocmVzdWx0LnNjZW5lLmNoaWxkcmVuWzBdKVxyXG5cdFx0XHRcdH0sIG51bGwsIHJlamVjdCk7XHJcblx0XHRcdH1cclxuXHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0Y29uc29sZS5lcnJvcihgQ29sbGFkYSBsb2FkZXIgbm90IGZvdW5kLiBcIiR7dXJsfVwiIG5vdCBsb2FkZWQuYCk7XHJcblx0XHRcdFx0cmVqZWN0KCk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHR9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gVGV4dHVyZVByb21pc2UodXJsKXtcclxuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT5cclxuXHR7XHJcblx0XHRpZihjYWNoZS50ZXh0dXJlc1t1cmxdKVxyXG5cdFx0XHRyZXR1cm4gcmVzb2x2ZShjYWNoZS50ZXh0dXJlc1t1cmxdKTtcclxuXHRcdGVsc2Uge1xyXG5cdFx0XHRsZXQgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKTtcclxuXHRcdFx0bG9hZGVyLmxvYWQodXJsLCB0ZXh0dXJlID0+IHtcclxuXHRcdFx0XHRjYWNoZS50ZXh0dXJlc1t1cmxdID0gdGV4dHVyZTtcclxuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZSh0ZXh0dXJlKTtcclxuXHRcdFx0fSwgbnVsbCwgcmVqZWN0KTtcclxuXHRcdH1cclxuXHR9KTtcclxufVxyXG5cclxuY2xhc3MgVmlkZW9Qcm9taXNlIGV4dGVuZHMgUHJvbWlzZSB7XHJcblx0Y29uc3RydWN0b3IodXJsKVxyXG5cdHtcclxuXHRcdC8vIHN0YXJ0IGxvYWRlclxyXG5cdFx0dmFyIHZpZFNyYyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3ZpZGVvJyk7XHJcblx0XHR2aWRTcmMuYXV0b3BsYXkgPSB0cnVlO1xyXG5cdFx0dmlkU3JjLmxvb3AgPSB0cnVlO1xyXG5cdFx0dmlkU3JjLnNyYyA9IHVybDtcclxuXHRcdHZpZFNyYy5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xyXG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh2aWRTcmMpO1xyXG5cclxuXHRcdHZhciB0ZXggPSBuZXcgVEhSRUUuVmlkZW9UZXh0dXJlKHZpZFNyYyk7XHJcblx0XHR0ZXgubWluRmlsdGVyID0gVEhSRUUuTGluZWFyRmlsdGVyO1xyXG5cdFx0dGV4Lm1hZ0ZpbHRlciA9IFRIUkVFLkxpbmVhckZpbHRlcjtcclxuXHRcdHRleC5mb3JtYXQgPSBUSFJFRS5SR0JGb3JtYXQ7XHJcblxyXG5cdFx0Ly9jYWNoZS52aWRlb3NbdXJsXSA9IHRleDtcclxuXHRcdC8vcGF5bG9hZC52aWRlb3NbaWRdID0gY2FjaGUudmlkZW9zW3VybF07XHJcblxyXG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0ZXgpO1xyXG5cdH1cclxufVxyXG5cclxuZnVuY3Rpb24gUG9zdGVyUHJvbWlzZSh1cmwpe1xyXG5cdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PlxyXG5cdHtcclxuXHRcdGlmKGNhY2hlLnBvc3RlcnNbdXJsXSlcclxuXHRcdFx0cmV0dXJuIHJlc29sdmUoY2FjaGUucG9zdGVyc1t1cmxdKTtcclxuXHRcdGVsc2UgcmV0dXJuIChuZXcgVGV4dHVyZVByb21pc2UodXJsKSkudGhlbih0ZXggPT5cclxuXHRcdFx0e1xyXG5cdFx0XHRcdGxldCByYXRpbyA9IHRleC5pbWFnZS53aWR0aCAvIHRleC5pbWFnZS5oZWlnaHQ7XHJcblx0XHRcdFx0bGV0IGdlbywgbWF0ID0gbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHttYXA6IHRleCwgc2lkZTogVEhSRUUuRG91YmxlU2lkZX0pO1xyXG5cclxuXHRcdFx0XHRpZihyYXRpbyA+IDEpe1xyXG5cdFx0XHRcdFx0Z2VvID0gbmV3IFRIUkVFLlBsYW5lR2VvbWV0cnkoMSwgMS9yYXRpbyk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdFx0Z2VvID0gbmV3IFRIUkVFLlBsYW5lR2VvbWV0cnkocmF0aW8sIDEpO1xyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0Y2FjaGUucG9zdGVyc1t1cmxdID0gbmV3IFRIUkVFLk1lc2goZ2VvLCBtYXQpO1xyXG5cdFx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLnBvc3RlcnNbdXJsXSk7XHJcblx0XHRcdH1cclxuXHRcdCk7XHJcblx0fSk7XHJcbn1cclxuXHJcbmV4cG9ydCB7IE1vZGVsUHJvbWlzZSwgVGV4dHVyZVByb21pc2UsIFZpZGVvUHJvbWlzZSwgUG9zdGVyUHJvbWlzZSwgY2FjaGUgYXMgX2NhY2hlIH07XHJcbiIsIid1c2Ugc3RyaWN0JztcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFByZXZpZXdDYW1lcmEgZXh0ZW5kcyBUSFJFRS5PcnRob2dyYXBoaWNDYW1lcmFcclxue1xyXG5cdGNvbnN0cnVjdG9yKGZvY3VzLCB2aWV3U2l6ZSwgbG9va0RpcmVjdGlvbilcclxuXHR7XHJcblx0XHRzdXBlcigtMSwgMSwgMSwgLTEsIC4xLCA0MDApO1xyXG5cclxuXHRcdGxldCBzZXR0aW5ncyA9IHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnZGlvcmFtYVZpZXdTZXR0aW5ncycpO1xyXG5cdFx0aWYoc2V0dGluZ3Mpe1xyXG5cdFx0XHRzZXR0aW5ncyA9IEpTT04ucGFyc2Uoc2V0dGluZ3MpO1xyXG5cdFx0XHRpZighZm9jdXMpXHJcblx0XHRcdFx0Zm9jdXMgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmZyb21BcnJheShzZXR0aW5ncy5mb2N1cyk7XHJcblx0XHRcdGlmKCF2aWV3U2l6ZSlcclxuXHRcdFx0XHR2aWV3U2l6ZSA9IHNldHRpbmdzLnZpZXdTaXplO1xyXG5cdFx0XHRpZighbG9va0RpcmVjdGlvbilcclxuXHRcdFx0XHRsb29rRGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5mcm9tQXJyYXkoc2V0dGluZ3MubG9va0RpcmVjdGlvbik7XHJcblx0XHR9XHJcblxyXG5cdFx0dGhpcy5fdmlld1NpemUgPSB2aWV3U2l6ZSB8fCA0MDtcclxuXHRcdHRoaXMuX2ZvY3VzID0gZm9jdXMgfHwgbmV3IFRIUkVFLlZlY3RvcjMoKTtcclxuXHRcdHRoaXMuX2xvb2tEaXJlY3Rpb24gPSBsb29rRGlyZWN0aW9uIHx8IG5ldyBUSFJFRS5WZWN0b3IzKDAsLTEsMCk7XHJcblx0XHR0aGlzLmdyaWRIZWxwZXIgPSBuZXcgVEhSRUUuR3JpZEhlbHBlcigzMDAsIDEpO1xyXG5cdFx0Ly90aGlzLmdyaWRIZWxwZXIucXVhdGVybmlvbi5zZXRGcm9tVW5pdFZlY3RvcnMoIG5ldyBUSFJFRS5WZWN0b3IzKDAsLTEsMCksIHRoaXMuX2xvb2tEaXJlY3Rpb24gKTtcclxuXHR9XHJcblxyXG5cdGdldCB2aWV3U2l6ZSgpe1xyXG5cdFx0cmV0dXJuIHRoaXMuX3ZpZXdTaXplO1xyXG5cdH1cclxuXHRzZXQgdmlld1NpemUodmFsKXtcclxuXHRcdHRoaXMuX3ZpZXdTaXplID0gdmFsO1xyXG5cdFx0dGhpcy5yZWNvbXB1dGVWaWV3cG9ydCgpO1xyXG5cdH1cclxuXHJcblx0Z2V0IGZvY3VzKCl7XHJcblx0XHRyZXR1cm4gdGhpcy5fZm9jdXM7XHJcblx0fVxyXG5cdHNldCBmb2N1cyh2YWwpe1xyXG5cdFx0dGhpcy5fZm9jdXMuY29weSh2YWwpO1xyXG5cdFx0dGhpcy5yZWNvbXB1dGVWaWV3cG9ydCgpO1xyXG5cdH1cclxuXHJcblx0Z2V0IGxvb2tEaXJlY3Rpb24oKXtcclxuXHRcdHJldHVybiB0aGlzLl9sb29rRGlyZWN0aW9uO1xyXG5cdH1cclxuXHRzZXQgbG9va0RpcmVjdGlvbih2YWwpe1xyXG5cdFx0dGhpcy5fbG9va0RpcmVjdGlvbi5jb3B5KHZhbCk7XHJcblx0XHR0aGlzLnJlY29tcHV0ZVZpZXdwb3J0KCk7XHJcblx0fVxyXG5cclxuXHRyZWdpc3Rlckhvb2tzKHJlbmRlcmVyKVxyXG5cdHtcclxuXHRcdHZhciBzZWxmID0gdGhpcztcclxuXHRcdHNlbGYucmVuZGVyZXIgPSByZW5kZXJlcjtcclxuXHJcblx0XHQvLyBzZXQgc3R5bGVzIG9uIHRoZSBwYWdlLCBzbyB0aGUgcHJldmlldyB3b3JrcyByaWdodFxyXG5cdFx0ZG9jdW1lbnQuYm9keS5wYXJlbnRFbGVtZW50LnN0eWxlLmhlaWdodCA9ICcxMDAlJztcclxuXHRcdGRvY3VtZW50LmJvZHkuc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xyXG5cdFx0ZG9jdW1lbnQuYm9keS5zdHlsZS5tYXJnaW4gPSAnMCc7XHJcblx0XHRkb2N1bWVudC5ib2R5LnN0eWxlLm92ZXJmbG93ID0gJ2hpZGRlbic7XHJcblxyXG5cdFx0dmFyIGluZm8gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJyk7XHJcblx0XHRpbmZvLmlubmVySFRNTCA9IFsnTWlkZGxlIGNsaWNrIGFuZCBkcmFnIHRvIHBhbicsICdNb3VzZSB3aGVlbCB0byB6b29tJywgJ0Fycm93IGtleXMgdG8gcm90YXRlJ10uam9pbignPGJyLz4nKTtcclxuXHRcdE9iamVjdC5hc3NpZ24oaW5mby5zdHlsZSwge1xyXG5cdFx0XHRwb3NpdGlvbjogJ2ZpeGVkJyxcclxuXHRcdFx0dG9wOiAnMTBweCcsXHJcblx0XHRcdGxlZnQ6ICcxMHB4JyxcclxuXHRcdFx0bWFyZ2luOiAwXHJcblx0XHR9KTtcclxuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoaW5mbyk7XHJcblxyXG5cdFx0Ly8gcmVzaXplIHRoZSBwcmV2aWV3IGNhbnZhcyB3aGVuIHdpbmRvdyByZXNpemVzXHJcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgZSA9PiBzZWxmLnJlY29tcHV0ZVZpZXdwb3J0KCkpO1xyXG5cdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xyXG5cclxuXHRcdC8vIG1pZGRsZSBjbGljayBhbmQgZHJhZyB0byBwYW4gdmlld1xyXG5cdFx0dmFyIGRyYWdTdGFydCA9IG51bGwsIGZvY3VzU3RhcnQgPSBudWxsO1xyXG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIGUgPT4ge1xyXG5cdFx0XHRpZihlLmJ1dHRvbiA9PT0gMSl7XHJcblx0XHRcdFx0ZHJhZ1N0YXJ0ID0ge3g6IGUuY2xpZW50WCwgeTogZS5jbGllbnRZfTtcclxuXHRcdFx0XHRmb2N1c1N0YXJ0ID0gc2VsZi5fZm9jdXMuY2xvbmUoKTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIGUgPT4ge1xyXG5cdFx0XHRpZihlLmJ1dHRvbiA9PT0gMSl7XHJcblx0XHRcdFx0ZHJhZ1N0YXJ0ID0gbnVsbDtcclxuXHRcdFx0XHRmb2N1c1N0YXJ0ID0gbnVsbDtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgZSA9PiB7XHJcblx0XHRcdGlmKGRyYWdTdGFydClcclxuXHRcdFx0e1xyXG5cdFx0XHRcdGxldCB7Y2xpZW50V2lkdGg6IHcsIGNsaWVudEhlaWdodDogaH0gPSBkb2N1bWVudC5ib2R5O1xyXG5cdFx0XHRcdGxldCBwaXhlbHNQZXJNZXRlciA9IE1hdGguc3FydCh3KncraCpoKSAvIHNlbGYuX3ZpZXdTaXplO1xyXG5cdFx0XHRcdGxldCBkeCA9IGUuY2xpZW50WCAtIGRyYWdTdGFydC54LCBkeSA9IGUuY2xpZW50WSAtIGRyYWdTdGFydC55O1xyXG5cdFx0XHRcdGxldCByaWdodCA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuY3Jvc3NWZWN0b3JzKHNlbGYuX2xvb2tEaXJlY3Rpb24sIHNlbGYudXApO1xyXG5cclxuXHRcdFx0XHRzZWxmLl9mb2N1cy5jb3B5KGZvY3VzU3RhcnQpXHJcblx0XHRcdFx0XHQuYWRkKHNlbGYudXAuY2xvbmUoKS5tdWx0aXBseVNjYWxhcihkeS9waXhlbHNQZXJNZXRlcikpXHJcblx0XHRcdFx0XHQuYWRkKHJpZ2h0Lm11bHRpcGx5U2NhbGFyKC1keC9waXhlbHNQZXJNZXRlcikpO1xyXG5cclxuXHRcdFx0XHRzZWxmLnJlY29tcHV0ZVZpZXdwb3J0KCk7XHJcblx0XHRcdH1cclxuXHRcdH0pO1xyXG5cclxuXHRcdC8vIHdoZWVsIHRvIHpvb21cclxuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCd3aGVlbCcsIGUgPT4ge1xyXG5cdFx0XHRpZihlLmRlbHRhWSA8IDApe1xyXG5cdFx0XHRcdHNlbGYuX3ZpZXdTaXplICo9IDAuOTA7XHJcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2UgaWYoZS5kZWx0YVkgPiAwKXtcclxuXHRcdFx0XHRzZWxmLl92aWV3U2l6ZSAqPSAxLjE7XHJcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xyXG5cdFx0XHR9XHJcblx0XHR9KTtcclxuXHJcblx0XHQvLyBhcnJvdyBrZXlzIHRvIHJvdGF0ZVxyXG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBlID0+IHtcclxuXHRcdFx0aWYoZS5rZXkgPT09ICdBcnJvd0Rvd24nKXtcclxuXHRcdFx0XHRsZXQgcmlnaHQgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmNyb3NzVmVjdG9ycyhzZWxmLl9sb29rRGlyZWN0aW9uLCBzZWxmLnVwKTtcclxuXHRcdFx0XHRzZWxmLl9sb29rRGlyZWN0aW9uLmFwcGx5QXhpc0FuZ2xlKHJpZ2h0LCBNYXRoLlBJLzIpO1xyXG5cdFx0XHRcdC8vc2VsZi5ncmlkSGVscGVyLnJvdGF0ZU9uQXhpcyhyaWdodCwgTWF0aC5QSS8yKTtcclxuXHRcdFx0XHRzZWxmLnJlY29tcHV0ZVZpZXdwb3J0KCk7XHJcblx0XHRcdH1cclxuXHRcdFx0ZWxzZSBpZihlLmtleSA9PT0gJ0Fycm93VXAnKXtcclxuXHRcdFx0XHRsZXQgcmlnaHQgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmNyb3NzVmVjdG9ycyhzZWxmLl9sb29rRGlyZWN0aW9uLCBzZWxmLnVwKTtcclxuXHRcdFx0XHRzZWxmLl9sb29rRGlyZWN0aW9uLmFwcGx5QXhpc0FuZ2xlKHJpZ2h0LCAtTWF0aC5QSS8yKTtcclxuXHRcdFx0XHQvL3NlbGYuZ3JpZEhlbHBlci5yb3RhdGVPbkF4aXMocmlnaHQsIC1NYXRoLlBJLzIpO1xyXG5cdFx0XHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcclxuXHJcblx0XHRcdH1cclxuXHRcdFx0ZWxzZSBpZihlLmtleSA9PT0gJ0Fycm93TGVmdCcpe1xyXG5cdFx0XHRcdHNlbGYuX2xvb2tEaXJlY3Rpb24uYXBwbHlBeGlzQW5nbGUoc2VsZi51cCwgLU1hdGguUEkvMik7XHJcblx0XHRcdFx0Ly9zZWxmLmdyaWRIZWxwZXIucm90YXRlT25BeGlzKHNlbGYudXAsIC1NYXRoLlBJLzIpO1xyXG5cdFx0XHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRlbHNlIGlmKGUua2V5ID09PSAnQXJyb3dSaWdodCcpe1xyXG5cdFx0XHRcdHNlbGYuX2xvb2tEaXJlY3Rpb24uYXBwbHlBeGlzQW5nbGUoc2VsZi51cCwgTWF0aC5QSS8yKTtcclxuXHRcdFx0XHQvL3NlbGYuZ3JpZEhlbHBlci5yb3RhdGVPbkF4aXMoc2VsZi51cCwgTWF0aC5QSS8yKTtcclxuXHRcdFx0XHRzZWxmLnJlY29tcHV0ZVZpZXdwb3J0KCk7XHJcblx0XHRcdH1cclxuXHRcdH0pO1xyXG5cdH1cclxuXHJcblx0cmVjb21wdXRlVmlld3BvcnQoKVxyXG5cdHtcclxuXHRcdHZhciB7Y2xpZW50V2lkdGg6IHcsIGNsaWVudEhlaWdodDogaH0gPSBkb2N1bWVudC5ib2R5O1xyXG5cclxuXHRcdC8vIHJlc2l6ZSBjYW52YXNcclxuXHRcdHRoaXMucmVuZGVyZXIuc2V0U2l6ZSh3LCBoKTtcclxuXHJcblx0XHQvLyBjb21wdXRlIHdpbmRvdyBkaW1lbnNpb25zIGZyb20gdmlldyBzaXplXHJcblx0XHR2YXIgcmF0aW8gPSB3L2g7XHJcblx0XHR2YXIgaGVpZ2h0ID0gTWF0aC5zcXJ0KCAodGhpcy5fdmlld1NpemUqdGhpcy5fdmlld1NpemUpIC8gKHJhdGlvKnJhdGlvICsgMSkgKTtcclxuXHRcdHZhciB3aWR0aCA9IHJhdGlvICogaGVpZ2h0O1xyXG5cclxuXHRcdC8vIHNldCBmcnVzdHJ1bSBlZGdlc1xyXG5cdFx0dGhpcy5sZWZ0ID0gLXdpZHRoLzI7XHJcblx0XHR0aGlzLnJpZ2h0ID0gd2lkdGgvMjtcclxuXHRcdHRoaXMudG9wID0gaGVpZ2h0LzI7XHJcblx0XHR0aGlzLmJvdHRvbSA9IC1oZWlnaHQvMjtcclxuXHJcblx0XHR0aGlzLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcclxuXHJcblx0XHQvLyB1cGRhdGUgcG9zaXRpb25cclxuXHRcdHRoaXMucG9zaXRpb24uY29weSh0aGlzLl9mb2N1cykuc3ViKCB0aGlzLl9sb29rRGlyZWN0aW9uLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoMjAwKSApO1xyXG5cdFx0aWYoIE1hdGguYWJzKCB0aGlzLl9sb29rRGlyZWN0aW9uLm5vcm1hbGl6ZSgpLmRvdChuZXcgVEhSRUUuVmVjdG9yMygwLC0xLDApKSApID09PSAxIClcclxuXHRcdFx0dGhpcy51cC5zZXQoMCwwLDEpOyAvLyBpZiB3ZSdyZSBsb29raW5nIGRvd24gdGhlIFkgYXhpc1xyXG5cdFx0ZWxzZVxyXG5cdFx0XHR0aGlzLnVwLnNldCgwLDEsMCk7XHJcblx0XHR0aGlzLmxvb2tBdCggdGhpcy5fZm9jdXMgKTtcclxuXHJcblx0XHR3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2Rpb3JhbWFWaWV3U2V0dGluZ3MnLCBKU09OLnN0cmluZ2lmeSh7XHJcblx0XHRcdGZvY3VzOiB0aGlzLl9mb2N1cy50b0FycmF5KCksXHJcblx0XHRcdHZpZXdTaXplOiB0aGlzLl92aWV3U2l6ZSxcclxuXHRcdFx0bG9va0RpcmVjdGlvbjogdGhpcy5fbG9va0RpcmVjdGlvbi50b0FycmF5KClcclxuXHRcdH0pKTtcclxuXHR9XHJcbn1cclxuIiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxuaW1wb3J0ICogYXMgTG9hZGVycyBmcm9tICcuL2xvYWRlcnMnO1xyXG5pbXBvcnQgUHJldmlld0NhbWVyYSBmcm9tICcuL2NhbWVyYSc7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBEaW9yYW1hXHJcbntcclxuXHRjb25zdHJ1Y3Rvcih7YmdDb2xvcj0weGFhYWFhYSwgZ3JpZE9mZnNldD1bMCwwLDBdLCBmdWxsc3BhY2U9ZmFsc2V9ID0ge30pXHJcblx0e1xyXG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xyXG5cdFx0c2VsZi5fY2FjaGUgPSBMb2FkZXJzLl9jYWNoZTtcclxuXHRcdHNlbGYuc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcclxuXHJcblx0XHQvLyBzZXQgdXAgcmVuZGVyZXIgYW5kIHNjYWxlXHJcblx0XHRpZihhbHRzcGFjZS5pbkNsaWVudClcclxuXHRcdHtcclxuXHRcdFx0c2VsZi5yZW5kZXJlciA9IGFsdHNwYWNlLmdldFRocmVlSlNSZW5kZXJlcigpO1xyXG5cdFx0XHRzZWxmLl9lbnZQcm9taXNlID0gUHJvbWlzZS5hbGwoW2FsdHNwYWNlLmdldEVuY2xvc3VyZSgpLCBhbHRzcGFjZS5nZXRTcGFjZSgpXSlcclxuXHRcdFx0LnRoZW4oZnVuY3Rpb24oW2UsIHNdKXtcclxuXHRcdFx0XHRzZWxmLmVudiA9IE9iamVjdC5mcmVlemUoT2JqZWN0LmFzc2lnbih7fSwgZSwgcykpO1xyXG5cdFx0XHRcdHNlbGYuc2NlbmUuc2NhbGUubXVsdGlwbHlTY2FsYXIoZS5waXhlbHNQZXJNZXRlcik7XHJcblxyXG5cdFx0XHRcdGlmKGZ1bGxzcGFjZSl7XHJcblx0XHRcdFx0XHRlLnJlcXVlc3RGdWxsc3BhY2UoKS5jYXRjaCgoZSkgPT4gY29uc29sZS5sb2coJ1JlcXVlc3QgZm9yIGZ1bGxzcGFjZSBkZW5pZWQnKSk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9KTtcclxuXHRcdH1cclxuXHRcdGVsc2VcclxuXHRcdHtcclxuXHRcdFx0Ly8gc2V0IHVwIHByZXZpZXcgcmVuZGVyZXIsIGluIGNhc2Ugd2UncmUgb3V0IG9mIHdvcmxkXHJcblx0XHRcdHNlbGYucmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcigpO1xyXG5cdFx0XHRzZWxmLnJlbmRlcmVyLnNldFNpemUoZG9jdW1lbnQuYm9keS5jbGllbnRXaWR0aCwgZG9jdW1lbnQuYm9keS5jbGllbnRIZWlnaHQpO1xyXG5cdFx0XHRzZWxmLnJlbmRlcmVyLnNldENsZWFyQ29sb3IoIGJnQ29sb3IgKTtcclxuXHRcdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChzZWxmLnJlbmRlcmVyLmRvbUVsZW1lbnQpO1xyXG5cdFx0XHJcblx0XHRcdHNlbGYucHJldmlld0NhbWVyYSA9IG5ldyBQcmV2aWV3Q2FtZXJhKCk7XHJcblx0XHRcdHNlbGYucHJldmlld0NhbWVyYS5ncmlkSGVscGVyLnBvc2l0aW9uLmZyb21BcnJheShncmlkT2Zmc2V0KTtcclxuXHRcdFx0c2VsZi5zY2VuZS5hZGQoc2VsZi5wcmV2aWV3Q2FtZXJhLCBzZWxmLnByZXZpZXdDYW1lcmEuZ3JpZEhlbHBlcik7XHJcblx0XHRcdHNlbGYucHJldmlld0NhbWVyYS5yZWdpc3Rlckhvb2tzKHNlbGYucmVuZGVyZXIpO1xyXG5cclxuXHRcdFx0Ly8gc2V0IHVwIGN1cnNvciBlbXVsYXRpb25cclxuXHRcdFx0YWx0c3BhY2UudXRpbGl0aWVzLnNoaW1zLmN1cnNvci5pbml0KHNlbGYuc2NlbmUsIHNlbGYucHJldmlld0NhbWVyYSwge3JlbmRlcmVyOiBzZWxmLnJlbmRlcmVyfSk7XHJcblx0XHRcclxuXHRcdFx0Ly8gc3R1YiBlbnZpcm9ubWVudFxyXG5cdFx0XHRzZWxmLmVudiA9IE9iamVjdC5mcmVlemUoe1xyXG5cdFx0XHRcdGlubmVyV2lkdGg6IDEwMjQsXHJcblx0XHRcdFx0aW5uZXJIZWlnaHQ6IDEwMjQsXHJcblx0XHRcdFx0aW5uZXJEZXB0aDogMTAyNCxcclxuXHRcdFx0XHRwaXhlbHNQZXJNZXRlcjogZnVsbHNwYWNlID8gMSA6IDEwMjQvMyxcclxuXHRcdFx0XHRzaWQ6ICdicm93c2VyJyxcclxuXHRcdFx0XHRuYW1lOiAnYnJvd3NlcicsXHJcblx0XHRcdFx0dGVtcGxhdGVTaWQ6ICdicm93c2VyJ1xyXG5cdFx0XHR9KTtcclxuXHRcdH1cclxuXHR9XHJcblx0XHRcclxuXHRcdFxyXG5cdHN0YXJ0KC4uLm1vZHVsZXMpXHJcblx0e1xyXG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xyXG5cclxuXHRcdC8vIG1ha2Ugc3VyZSBzcGFjZSBpbmZvIGlzIGZpbGxlZCBvdXQgYmVmb3JlIGluaXRpYWxpemF0aW9uXHJcblx0XHRpZighc2VsZi5lbnYpe1xyXG5cdFx0XHRyZXR1cm4gc2VsZi5fZW52UHJvbWlzZS50aGVuKCgpID0+IHsgc2VsZi5zdGFydCguLi5tb2R1bGVzKTsgfSk7XHJcblx0XHR9XHJcblxyXG5cdFx0Ly8gZGV0ZXJtaW5lIHdoaWNoIGFzc2V0cyBhcmVuJ3Qgc2hhcmVkXHJcblx0XHR2YXIgc2luZ2xldG9ucyA9IHt9O1xyXG5cdFx0bW9kdWxlcy5mb3JFYWNoKG1vZCA9PlxyXG5cdFx0e1xyXG5cdFx0XHRmdW5jdGlvbiBjaGVja0Fzc2V0KHVybCl7XHJcblx0XHRcdFx0aWYoc2luZ2xldG9uc1t1cmxdID09PSB1bmRlZmluZWQpIHNpbmdsZXRvbnNbdXJsXSA9IHRydWU7XHJcblx0XHRcdFx0ZWxzZSBpZihzaW5nbGV0b25zW3VybF0gPT09IHRydWUpIHNpbmdsZXRvbnNbdXJsXSA9IGZhbHNlO1xyXG5cdFx0XHR9XHJcblx0XHRcdE9iamVjdC5rZXlzKG1vZC5hc3NldHMudGV4dHVyZXMgfHwge30pLm1hcChrID0+IG1vZC5hc3NldHMudGV4dHVyZXNba10pLmZvckVhY2goY2hlY2tBc3NldCk7XHJcblx0XHRcdE9iamVjdC5rZXlzKG1vZC5hc3NldHMubW9kZWxzIHx8IHt9KS5tYXAoayA9PiBtb2QuYXNzZXRzLm1vZGVsc1trXSkuZm9yRWFjaChjaGVja0Fzc2V0KTtcclxuXHRcdFx0T2JqZWN0LmtleXMobW9kLmFzc2V0cy5wb3N0ZXJzIHx8IHt9KS5tYXAoayA9PiBtb2QuYXNzZXRzLnBvc3RlcnNba10pLmZvckVhY2goY2hlY2tBc3NldCk7XHJcblx0XHR9KTtcclxuXHJcblx0XHQvLyBkZXRlcm1pbmUgaWYgdGhlIHRyYWNraW5nIHNrZWxldG9uIGlzIG5lZWRlZFxyXG5cdFx0bGV0IG5lZWRzU2tlbGV0b24gPSBtb2R1bGVzLnJlZHVjZSgobnMsbSkgPT4gbnMgfHwgbS5uZWVkc1NrZWxldG9uLCBmYWxzZSk7XHJcblx0XHRpZihuZWVkc1NrZWxldG9uICYmIGFsdHNwYWNlLmluQ2xpZW50KXtcclxuXHRcdFx0YWx0c3BhY2UuZ2V0VGhyZWVKU1RyYWNraW5nU2tlbGV0b24oKS50aGVuKHNrZWwgPT4ge1xyXG5cdFx0XHRcdHNlbGYuc2NlbmUuYWRkKHNrZWwpO1xyXG5cdFx0XHRcdHNlbGYuZW52LnNrZWwgPSBza2VsO1xyXG5cdFx0XHR9KTtcclxuXHRcdH1cclxuXHJcblx0XHQvLyBjb25zdHJ1Y3QgZGlvcmFtYXNcclxuXHRcdG1vZHVsZXMuZm9yRWFjaChmdW5jdGlvbihtb2R1bGUpXHJcblx0XHR7XHJcblx0XHRcdGxldCByb290ID0gbnVsbDtcclxuXHRcdFx0XHJcblx0XHRcdGlmKG1vZHVsZSBpbnN0YW5jZW9mIFRIUkVFLk9iamVjdDNEKXtcclxuXHRcdFx0XHRyb290ID0gbW9kdWxlO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2VcclxuXHRcdFx0e1xyXG5cdFx0XHRcdHJvb3QgPSBuZXcgVEhSRUUuT2JqZWN0M0QoKTtcclxuXHJcblx0XHRcdFx0Ly8gaGFuZGxlIGFic29sdXRlIHBvc2l0aW9uaW5nXHJcblx0XHRcdFx0aWYobW9kdWxlLnRyYW5zZm9ybSl7XHJcblx0XHRcdFx0XHRyb290Lm1hdHJpeC5mcm9tQXJyYXkobW9kdWxlLnRyYW5zZm9ybSk7XHJcblx0XHRcdFx0XHRyb290Lm1hdHJpeC5kZWNvbXBvc2Uocm9vdC5wb3NpdGlvbiwgcm9vdC5xdWF0ZXJuaW9uLCByb290LnNjYWxlKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0XHRpZihtb2R1bGUucG9zaXRpb24pe1xyXG5cdFx0XHRcdFx0XHRyb290LnBvc2l0aW9uLmZyb21BcnJheShtb2R1bGUucG9zaXRpb24pO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0aWYobW9kdWxlLnJvdGF0aW9uKXtcclxuXHRcdFx0XHRcdFx0cm9vdC5yb3RhdGlvbi5mcm9tQXJyYXkobW9kdWxlLnJvdGF0aW9uKTtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdC8vIGhhbmRsZSByZWxhdGl2ZSBwb3NpdGlvbmluZ1xyXG5cdFx0XHRpZihtb2R1bGUudmVydGljYWxBbGlnbil7XHJcblx0XHRcdFx0bGV0IGhhbGZIZWlnaHQgPSBzZWxmLmVudi5pbm5lckhlaWdodC8oMipzZWxmLmVudi5waXhlbHNQZXJNZXRlcik7XHJcblx0XHRcdFx0c3dpdGNoKG1vZHVsZS52ZXJ0aWNhbEFsaWduKXtcclxuXHRcdFx0XHRjYXNlICd0b3AnOlxyXG5cdFx0XHRcdFx0cm9vdC50cmFuc2xhdGVZKGhhbGZIZWlnaHQpO1xyXG5cdFx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdFx0Y2FzZSAnYm90dG9tJzpcclxuXHRcdFx0XHRcdHJvb3QudHJhbnNsYXRlWSgtaGFsZkhlaWdodCk7XHJcblx0XHRcdFx0XHRicmVhaztcclxuXHRcdFx0XHRjYXNlICdtaWRkbGUnOlxyXG5cdFx0XHRcdFx0Ly8gZGVmYXVsdFxyXG5cdFx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdFx0ZGVmYXVsdDpcclxuXHRcdFx0XHRcdGNvbnNvbGUud2FybignSW52YWxpZCB2YWx1ZSBmb3IgXCJ2ZXJ0aWNhbEFsaWduXCIgLSAnLCBtb2R1bGUudmVydGljYWxBbGlnbik7XHJcblx0XHRcdFx0XHRicmVhaztcclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHJcblx0XHRcdHNlbGYuc2NlbmUuYWRkKHJvb3QpO1xyXG5cclxuXHRcdFx0aWYoc2VsZi5wcmV2aWV3Q2FtZXJhKXtcclxuXHRcdFx0XHRyb290LmFkZCggbmV3IFRIUkVFLkF4aXNIZWxwZXIoMSkgKTtcclxuXHRcdFx0fVxyXG5cdFx0XHJcblx0XHRcdHNlbGYubG9hZEFzc2V0cyhtb2R1bGUuYXNzZXRzLCBzaW5nbGV0b25zKS50aGVuKChyZXN1bHRzKSA9PiB7XHJcblx0XHRcdFx0bW9kdWxlLmluaXRpYWxpemUoc2VsZi5lbnYsIHJvb3QsIHJlc3VsdHMpO1xyXG5cdFx0XHR9KTtcclxuXHRcdH0pO1xyXG5cdFx0XHJcblx0XHQvLyBzdGFydCBhbmltYXRpbmdcclxuXHRcdHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoZnVuY3Rpb24gYW5pbWF0ZSh0aW1lc3RhbXApXHJcblx0XHR7XHJcblx0XHRcdHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoYW5pbWF0ZSk7XHJcblx0XHRcdHNlbGYuc2NlbmUudXBkYXRlQWxsQmVoYXZpb3JzKCk7XHJcblx0XHRcdGlmKHdpbmRvdy5UV0VFTikgVFdFRU4udXBkYXRlKCk7XHJcblx0XHRcdHNlbGYucmVuZGVyZXIucmVuZGVyKHNlbGYuc2NlbmUsIHNlbGYucHJldmlld0NhbWVyYSk7XHJcblx0XHR9KTtcclxuXHR9XHJcblxyXG5cdGxvYWRBc3NldHMobWFuaWZlc3QsIHNpbmdsZXRvbnMpXHJcblx0e1xyXG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xyXG5cclxuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PlxyXG5cdFx0e1xyXG5cdFx0XHQvLyBwb3B1bGF0ZSBjYWNoZVxyXG5cdFx0XHRQcm9taXNlLmFsbChbXHJcblxyXG5cdFx0XHRcdC8vIHBvcHVsYXRlIG1vZGVsIGNhY2hlXHJcblx0XHRcdFx0Li4uT2JqZWN0LmtleXMobWFuaWZlc3QubW9kZWxzIHx8IHt9KS5tYXAoaWQgPT4gTG9hZGVycy5Nb2RlbFByb21pc2UobWFuaWZlc3QubW9kZWxzW2lkXSkpLFxyXG5cclxuXHRcdFx0XHQvLyBwb3B1bGF0ZSBleHBsaWNpdCB0ZXh0dXJlIGNhY2hlXHJcblx0XHRcdFx0Li4uT2JqZWN0LmtleXMobWFuaWZlc3QudGV4dHVyZXMgfHwge30pLm1hcChpZCA9PiBMb2FkZXJzLlRleHR1cmVQcm9taXNlKG1hbmlmZXN0LnRleHR1cmVzW2lkXSkpLFxyXG5cclxuXHRcdFx0XHQvLyBnZW5lcmF0ZSBhbGwgcG9zdGVyc1xyXG5cdFx0XHRcdC4uLk9iamVjdC5rZXlzKG1hbmlmZXN0LnBvc3RlcnMgfHwge30pLm1hcChpZCA9PiBMb2FkZXJzLlBvc3RlclByb21pc2UobWFuaWZlc3QucG9zdGVyc1tpZF0pKVxyXG5cdFx0XHRdKVxyXG5cclxuXHRcdFx0LnRoZW4oKCkgPT5cclxuXHRcdFx0e1xyXG5cdFx0XHRcdC8vIHBvcHVsYXRlIHBheWxvYWQgZnJvbSBjYWNoZVxyXG5cdFx0XHRcdHZhciBwYXlsb2FkID0ge21vZGVsczoge30sIHRleHR1cmVzOiB7fSwgcG9zdGVyczoge319O1xyXG5cclxuXHRcdFx0XHRmb3IobGV0IGkgaW4gbWFuaWZlc3QubW9kZWxzKXtcclxuXHRcdFx0XHRcdGxldCB1cmwgPSBtYW5pZmVzdC5tb2RlbHNbaV07XHJcblx0XHRcdFx0XHRsZXQgdCA9IExvYWRlcnMuX2NhY2hlLm1vZGVsc1t1cmxdO1xyXG5cdFx0XHRcdFx0cGF5bG9hZC5tb2RlbHNbaV0gPSB0ID8gc2luZ2xldG9uc1t1cmxdID8gdCA6IHQuY2xvbmUoKSA6IG51bGw7XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRmb3IobGV0IGkgaW4gbWFuaWZlc3QudGV4dHVyZXMpe1xyXG5cdFx0XHRcdFx0bGV0IHVybCA9IG1hbmlmZXN0LnRleHR1cmVzW2ldO1xyXG5cdFx0XHRcdFx0bGV0IHQgPSBMb2FkZXJzLl9jYWNoZS50ZXh0dXJlc1t1cmxdO1xyXG5cdFx0XHRcdFx0cGF5bG9hZC50ZXh0dXJlc1tpXSA9IHQgPyBzaW5nbGV0b25zW3VybF0gPyB0IDogdC5jbG9uZSgpIDogbnVsbDtcclxuXHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdGZvcihsZXQgaSBpbiBtYW5pZmVzdC5wb3N0ZXJzKXtcclxuXHRcdFx0XHRcdGxldCB1cmwgPSBtYW5pZmVzdC5wb3N0ZXJzW2ldO1xyXG5cdFx0XHRcdFx0bGV0IHQgPSBMb2FkZXJzLl9jYWNoZS5wb3N0ZXJzW3VybF07XHJcblx0XHRcdFx0XHRwYXlsb2FkLnBvc3RlcnNbaV0gPSB0ID8gc2luZ2xldG9uc1t1cmxdID8gdCA6IHQuY2xvbmUoKSA6IG51bGw7XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRyZXNvbHZlKHBheWxvYWQpO1xyXG5cdFx0XHR9KVxyXG5cdFx0XHQuY2F0Y2goZSA9PiBjb25zb2xlLmVycm9yKGUpKTtcclxuXHRcdH0pO1xyXG5cdH1cclxuXHJcbn07XHJcbiJdLCJuYW1lcyI6WyJsZXQiLCJsb2FkZXIiLCJzdXBlciIsInJpZ2h0IiwiTG9hZGVycy5fY2FjaGUiLCJMb2FkZXJzLk1vZGVsUHJvbWlzZSIsIkxvYWRlcnMu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
