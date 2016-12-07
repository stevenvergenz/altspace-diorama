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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjpudWxsLCJzb3VyY2VzIjpbIi4uL3NyYy9sb2FkZXJzLmpzIiwiLi4vc3JjL2NhbWVyYS5qcyIsIi4uL3NyYy9tYWluLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcblxubGV0IGNhY2hlID0ge21vZGVsczoge30sIHRleHR1cmVzOiB7fSwgcG9zdGVyczoge319O1xuXG5mdW5jdGlvbiBNb2RlbFByb21pc2UodXJsKVxue1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT5cblx0e1xuXHRcdGlmKGNhY2hlLm1vZGVsc1t1cmxdKXtcblx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLm1vZGVsc1t1cmxdKTtcblx0XHR9XG5cblx0XHQvLyBOT1RFOiBnbFRGIGxvYWRlciBkb2VzIG5vdCBjYXRjaCBlcnJvcnNcblx0XHRlbHNlIGlmKC9cXC5nbHRmJC9pLnRlc3QodXJsKSl7XG5cdFx0XHRpZihUSFJFRS5nbFRGTG9hZGVyKXtcblx0XHRcdFx0bGV0IGxvYWRlciA9IG5ldyBUSFJFRS5nbFRGTG9hZGVyKCk7XG5cdFx0XHRcdGxvYWRlci5sb2FkKHVybCwgKHJlc3VsdCkgPT4ge1xuXHRcdFx0XHRcdGNhY2hlLm1vZGVsc1t1cmxdID0gcmVzdWx0LnNjZW5lLmNoaWxkcmVuWzBdLmNoaWxkcmVuWzBdO1xuXHRcdFx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLm1vZGVsc1t1cmxdKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmKFRIUkVFLkdMVEZMb2FkZXIpe1xuXHRcdFx0XHRsZXQgbG9hZGVyID0gbmV3IFRIUkVFLkdMVEZMb2FkZXIoKTtcblx0XHRcdFx0bG9hZGVyLmxvYWQodXJsLCByZXN1bHQgPT4ge1xuXHRcdFx0XHRcdGNhY2hlLm1vZGVsc1t1cmxdID0gcmVzdWx0LnNjZW5lLmNoaWxkcmVuWzBdO1xuXHRcdFx0XHRcdGNhY2hlLm1vZGVsc1t1cmxdLm1hdHJpeEF1dG9VcGRhdGUgPSB0cnVlO1xuXHRcdFx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLm1vZGVsc1t1cmxdKTtcblx0XHRcdFx0fSwgKCkgPT4ge30sIHJlamVjdCk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0Y29uc29sZS5lcnJvcihgZ2xURiBsb2FkZXIgbm90IGZvdW5kLiBcIiR7dXJsfVwiIG5vdCBsb2FkZWQuYCk7XG5cdFx0XHRcdHJlamVjdCgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGVsc2UgaWYoL1xcLmRhZSQvaS50ZXN0KHVybCkpe1xuXHRcdFx0aWYoVEhSRUUuQ29sbGFkYUxvYWRlcil7XG5cdFx0XHRcdGxldCBsb2FkZXIgPSBuZXcgVEhSRUUuQ29sbGFkYUxvYWRlcigpO1xuXHRcdFx0XHRsb2FkZXIubG9hZCh1cmwsIHJlc3VsdCA9PiB7XG5cdFx0XHRcdFx0Y2FjaGUubW9kZWxzW3VybF0gPSByZXN1bHQuc2NlbmUuY2hpbGRyZW5bMF07XG5cdFx0XHRcdFx0cmV0dXJuIHJlc29sdmUocmVzdWx0LnNjZW5lLmNoaWxkcmVuWzBdKVxuXHRcdFx0XHR9LCBudWxsLCByZWplY3QpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoYENvbGxhZGEgbG9hZGVyIG5vdCBmb3VuZC4gXCIke3VybH1cIiBub3QgbG9hZGVkLmApO1xuXHRcdFx0XHRyZWplY3QoKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBUZXh0dXJlUHJvbWlzZSh1cmwpe1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT5cblx0e1xuXHRcdGlmKGNhY2hlLnRleHR1cmVzW3VybF0pXG5cdFx0XHRyZXR1cm4gcmVzb2x2ZShjYWNoZS50ZXh0dXJlc1t1cmxdKTtcblx0XHRlbHNlIHtcblx0XHRcdGxldCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpO1xuXHRcdFx0bG9hZGVyLmxvYWQodXJsLCB0ZXh0dXJlID0+IHtcblx0XHRcdFx0Y2FjaGUudGV4dHVyZXNbdXJsXSA9IHRleHR1cmU7XG5cdFx0XHRcdHJldHVybiByZXNvbHZlKHRleHR1cmUpO1xuXHRcdFx0fSwgbnVsbCwgcmVqZWN0KTtcblx0XHR9XG5cdH0pO1xufVxuXG5jbGFzcyBWaWRlb1Byb21pc2UgZXh0ZW5kcyBQcm9taXNlIHtcblx0Y29uc3RydWN0b3IodXJsKVxuXHR7XG5cdFx0Ly8gc3RhcnQgbG9hZGVyXG5cdFx0dmFyIHZpZFNyYyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3ZpZGVvJyk7XG5cdFx0dmlkU3JjLmF1dG9wbGF5ID0gdHJ1ZTtcblx0XHR2aWRTcmMubG9vcCA9IHRydWU7XG5cdFx0dmlkU3JjLnNyYyA9IHVybDtcblx0XHR2aWRTcmMuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHZpZFNyYyk7XG5cblx0XHR2YXIgdGV4ID0gbmV3IFRIUkVFLlZpZGVvVGV4dHVyZSh2aWRTcmMpO1xuXHRcdHRleC5taW5GaWx0ZXIgPSBUSFJFRS5MaW5lYXJGaWx0ZXI7XG5cdFx0dGV4Lm1hZ0ZpbHRlciA9IFRIUkVFLkxpbmVhckZpbHRlcjtcblx0XHR0ZXguZm9ybWF0ID0gVEhSRUUuUkdCRm9ybWF0O1xuXG5cdFx0Ly9jYWNoZS52aWRlb3NbdXJsXSA9IHRleDtcblx0XHQvL3BheWxvYWQudmlkZW9zW2lkXSA9IGNhY2hlLnZpZGVvc1t1cmxdO1xuXG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0ZXgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIFBvc3RlclByb21pc2UodXJsKXtcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XG5cdHtcblx0XHRpZihjYWNoZS5wb3N0ZXJzW3VybF0pXG5cdFx0XHRyZXR1cm4gcmVzb2x2ZShjYWNoZS5wb3N0ZXJzW3VybF0pO1xuXHRcdGVsc2UgcmV0dXJuIChuZXcgVGV4dHVyZVByb21pc2UodXJsKSkudGhlbih0ZXggPT5cblx0XHRcdHtcblx0XHRcdFx0bGV0IHJhdGlvID0gdGV4LmltYWdlLndpZHRoIC8gdGV4LmltYWdlLmhlaWdodDtcblx0XHRcdFx0bGV0IGdlbywgbWF0ID0gbmV3IFRIUkVFLk1lc2hCYXNpY01hdGVyaWFsKHttYXA6IHRleCwgc2lkZTogVEhSRUUuRG91YmxlU2lkZX0pO1xuXG5cdFx0XHRcdGlmKHJhdGlvID4gMSl7XG5cdFx0XHRcdFx0Z2VvID0gbmV3IFRIUkVFLlBsYW5lR2VvbWV0cnkoMSwgMS9yYXRpbyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0Z2VvID0gbmV3IFRIUkVFLlBsYW5lR2VvbWV0cnkocmF0aW8sIDEpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y2FjaGUucG9zdGVyc1t1cmxdID0gbmV3IFRIUkVFLk1lc2goZ2VvLCBtYXQpO1xuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZShjYWNoZS5wb3N0ZXJzW3VybF0pO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xufVxuXG5leHBvcnQgeyBNb2RlbFByb21pc2UsIFRleHR1cmVQcm9taXNlLCBWaWRlb1Byb21pc2UsIFBvc3RlclByb21pc2UsIGNhY2hlIGFzIF9jYWNoZSB9O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBQcmV2aWV3Q2FtZXJhIGV4dGVuZHMgVEhSRUUuT3J0aG9ncmFwaGljQ2FtZXJhXG57XG5cdGNvbnN0cnVjdG9yKGZvY3VzLCB2aWV3U2l6ZSwgbG9va0RpcmVjdGlvbilcblx0e1xuXHRcdHN1cGVyKC0xLCAxLCAxLCAtMSwgLjEsIDQwMCk7XG5cblx0XHRsZXQgc2V0dGluZ3MgPSB3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2Rpb3JhbWFWaWV3U2V0dGluZ3MnKTtcblx0XHRpZihzZXR0aW5ncyl7XG5cdFx0XHRzZXR0aW5ncyA9IEpTT04ucGFyc2Uoc2V0dGluZ3MpO1xuXHRcdFx0aWYoIWZvY3VzKVxuXHRcdFx0XHRmb2N1cyA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuZnJvbUFycmF5KHNldHRpbmdzLmZvY3VzKTtcblx0XHRcdGlmKCF2aWV3U2l6ZSlcblx0XHRcdFx0dmlld1NpemUgPSBzZXR0aW5ncy52aWV3U2l6ZTtcblx0XHRcdGlmKCFsb29rRGlyZWN0aW9uKVxuXHRcdFx0XHRsb29rRGlyZWN0aW9uID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5mcm9tQXJyYXkoc2V0dGluZ3MubG9va0RpcmVjdGlvbik7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdmlld1NpemUgPSB2aWV3U2l6ZSB8fCA0MDtcblx0XHR0aGlzLl9mb2N1cyA9IGZvY3VzIHx8IG5ldyBUSFJFRS5WZWN0b3IzKCk7XG5cdFx0dGhpcy5fbG9va0RpcmVjdGlvbiA9IGxvb2tEaXJlY3Rpb24gfHwgbmV3IFRIUkVFLlZlY3RvcjMoMCwtMSwwKTtcblx0XHR0aGlzLmdyaWRIZWxwZXIgPSBuZXcgVEhSRUUuR3JpZEhlbHBlcigzMDAsIDEpO1xuXHRcdC8vdGhpcy5ncmlkSGVscGVyLnF1YXRlcm5pb24uc2V0RnJvbVVuaXRWZWN0b3JzKCBuZXcgVEhSRUUuVmVjdG9yMygwLC0xLDApLCB0aGlzLl9sb29rRGlyZWN0aW9uICk7XG5cdH1cblxuXHRnZXQgdmlld1NpemUoKXtcblx0XHRyZXR1cm4gdGhpcy5fdmlld1NpemU7XG5cdH1cblx0c2V0IHZpZXdTaXplKHZhbCl7XG5cdFx0dGhpcy5fdmlld1NpemUgPSB2YWw7XG5cdFx0dGhpcy5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXHR9XG5cblx0Z2V0IGZvY3VzKCl7XG5cdFx0cmV0dXJuIHRoaXMuX2ZvY3VzO1xuXHR9XG5cdHNldCBmb2N1cyh2YWwpe1xuXHRcdHRoaXMuX2ZvY3VzLmNvcHkodmFsKTtcblx0XHR0aGlzLnJlY29tcHV0ZVZpZXdwb3J0KCk7XG5cdH1cblxuXHRnZXQgbG9va0RpcmVjdGlvbigpe1xuXHRcdHJldHVybiB0aGlzLl9sb29rRGlyZWN0aW9uO1xuXHR9XG5cdHNldCBsb29rRGlyZWN0aW9uKHZhbCl7XG5cdFx0dGhpcy5fbG9va0RpcmVjdGlvbi5jb3B5KHZhbCk7XG5cdFx0dGhpcy5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXHR9XG5cblx0cmVnaXN0ZXJIb29rcyhyZW5kZXJlcilcblx0e1xuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRzZWxmLnJlbmRlcmVyID0gcmVuZGVyZXI7XG5cblx0XHQvLyBzZXQgc3R5bGVzIG9uIHRoZSBwYWdlLCBzbyB0aGUgcHJldmlldyB3b3JrcyByaWdodFxuXHRcdGRvY3VtZW50LmJvZHkucGFyZW50RWxlbWVudC5zdHlsZS5oZWlnaHQgPSAnMTAwJSc7XG5cdFx0ZG9jdW1lbnQuYm9keS5zdHlsZS5oZWlnaHQgPSAnMTAwJSc7XG5cdFx0ZG9jdW1lbnQuYm9keS5zdHlsZS5tYXJnaW4gPSAnMCc7XG5cdFx0ZG9jdW1lbnQuYm9keS5zdHlsZS5vdmVyZmxvdyA9ICdoaWRkZW4nO1xuXG5cdFx0dmFyIGluZm8gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJyk7XG5cdFx0aW5mby5pbm5lckhUTUwgPSBbJ01pZGRsZSBjbGljayBhbmQgZHJhZyB0byBwYW4nLCAnTW91c2Ugd2hlZWwgdG8gem9vbScsICdBcnJvdyBrZXlzIHRvIHJvdGF0ZSddLmpvaW4oJzxici8+Jyk7XG5cdFx0T2JqZWN0LmFzc2lnbihpbmZvLnN0eWxlLCB7XG5cdFx0XHRwb3NpdGlvbjogJ2ZpeGVkJyxcblx0XHRcdHRvcDogJzEwcHgnLFxuXHRcdFx0bGVmdDogJzEwcHgnLFxuXHRcdFx0bWFyZ2luOiAwXG5cdFx0fSk7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChpbmZvKTtcblxuXHRcdC8vIHJlc2l6ZSB0aGUgcHJldmlldyBjYW52YXMgd2hlbiB3aW5kb3cgcmVzaXplc1xuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCBlID0+IHNlbGYucmVjb21wdXRlVmlld3BvcnQoKSk7XG5cdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXG5cdFx0Ly8gbWlkZGxlIGNsaWNrIGFuZCBkcmFnIHRvIHBhbiB2aWV3XG5cdFx0dmFyIGRyYWdTdGFydCA9IG51bGwsIGZvY3VzU3RhcnQgPSBudWxsO1xuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBlID0+IHtcblx0XHRcdGlmKGUuYnV0dG9uID09PSAxKXtcblx0XHRcdFx0ZHJhZ1N0YXJ0ID0ge3g6IGUuY2xpZW50WCwgeTogZS5jbGllbnRZfTtcblx0XHRcdFx0Zm9jdXNTdGFydCA9IHNlbGYuX2ZvY3VzLmNsb25lKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCBlID0+IHtcblx0XHRcdGlmKGUuYnV0dG9uID09PSAxKXtcblx0XHRcdFx0ZHJhZ1N0YXJ0ID0gbnVsbDtcblx0XHRcdFx0Zm9jdXNTdGFydCA9IG51bGw7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIGUgPT4ge1xuXHRcdFx0aWYoZHJhZ1N0YXJ0KVxuXHRcdFx0e1xuXHRcdFx0XHRsZXQge2NsaWVudFdpZHRoOiB3LCBjbGllbnRIZWlnaHQ6IGh9ID0gZG9jdW1lbnQuYm9keTtcblx0XHRcdFx0bGV0IHBpeGVsc1Blck1ldGVyID0gTWF0aC5zcXJ0KHcqdytoKmgpIC8gc2VsZi5fdmlld1NpemU7XG5cdFx0XHRcdGxldCBkeCA9IGUuY2xpZW50WCAtIGRyYWdTdGFydC54LCBkeSA9IGUuY2xpZW50WSAtIGRyYWdTdGFydC55O1xuXHRcdFx0XHRsZXQgcmlnaHQgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmNyb3NzVmVjdG9ycyhzZWxmLl9sb29rRGlyZWN0aW9uLCBzZWxmLnVwKTtcblxuXHRcdFx0XHRzZWxmLl9mb2N1cy5jb3B5KGZvY3VzU3RhcnQpXG5cdFx0XHRcdFx0LmFkZChzZWxmLnVwLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoZHkvcGl4ZWxzUGVyTWV0ZXIpKVxuXHRcdFx0XHRcdC5hZGQocmlnaHQubXVsdGlwbHlTY2FsYXIoLWR4L3BpeGVsc1Blck1ldGVyKSk7XG5cblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gd2hlZWwgdG8gem9vbVxuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCd3aGVlbCcsIGUgPT4ge1xuXHRcdFx0aWYoZS5kZWx0YVkgPCAwKXtcblx0XHRcdFx0c2VsZi5fdmlld1NpemUgKj0gMC45MDtcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZihlLmRlbHRhWSA+IDApe1xuXHRcdFx0XHRzZWxmLl92aWV3U2l6ZSAqPSAxLjE7XG5cdFx0XHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIGFycm93IGtleXMgdG8gcm90YXRlXG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBlID0+IHtcblx0XHRcdGlmKGUua2V5ID09PSAnQXJyb3dEb3duJyl7XG5cdFx0XHRcdGxldCByaWdodCA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuY3Jvc3NWZWN0b3JzKHNlbGYuX2xvb2tEaXJlY3Rpb24sIHNlbGYudXApO1xuXHRcdFx0XHRzZWxmLl9sb29rRGlyZWN0aW9uLmFwcGx5QXhpc0FuZ2xlKHJpZ2h0LCBNYXRoLlBJLzIpO1xuXHRcdFx0XHQvL3NlbGYuZ3JpZEhlbHBlci5yb3RhdGVPbkF4aXMocmlnaHQsIE1hdGguUEkvMik7XG5cdFx0XHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcblx0XHRcdH1cblx0XHRcdGVsc2UgaWYoZS5rZXkgPT09ICdBcnJvd1VwJyl7XG5cdFx0XHRcdGxldCByaWdodCA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuY3Jvc3NWZWN0b3JzKHNlbGYuX2xvb2tEaXJlY3Rpb24sIHNlbGYudXApO1xuXHRcdFx0XHRzZWxmLl9sb29rRGlyZWN0aW9uLmFwcGx5QXhpc0FuZ2xlKHJpZ2h0LCAtTWF0aC5QSS8yKTtcblx0XHRcdFx0Ly9zZWxmLmdyaWRIZWxwZXIucm90YXRlT25BeGlzKHJpZ2h0LCAtTWF0aC5QSS8yKTtcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmKGUua2V5ID09PSAnQXJyb3dMZWZ0Jyl7XG5cdFx0XHRcdHNlbGYuX2xvb2tEaXJlY3Rpb24uYXBwbHlBeGlzQW5nbGUoc2VsZi51cCwgLU1hdGguUEkvMik7XG5cdFx0XHRcdC8vc2VsZi5ncmlkSGVscGVyLnJvdGF0ZU9uQXhpcyhzZWxmLnVwLCAtTWF0aC5QSS8yKTtcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZihlLmtleSA9PT0gJ0Fycm93UmlnaHQnKXtcblx0XHRcdFx0c2VsZi5fbG9va0RpcmVjdGlvbi5hcHBseUF4aXNBbmdsZShzZWxmLnVwLCBNYXRoLlBJLzIpO1xuXHRcdFx0XHQvL3NlbGYuZ3JpZEhlbHBlci5yb3RhdGVPbkF4aXMoc2VsZi51cCwgTWF0aC5QSS8yKTtcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cmVjb21wdXRlVmlld3BvcnQoKVxuXHR7XG5cdFx0dmFyIHtjbGllbnRXaWR0aDogdywgY2xpZW50SGVpZ2h0OiBofSA9IGRvY3VtZW50LmJvZHk7XG5cblx0XHQvLyByZXNpemUgY2FudmFzXG5cdFx0dGhpcy5yZW5kZXJlci5zZXRTaXplKHcsIGgpO1xuXG5cdFx0Ly8gY29tcHV0ZSB3aW5kb3cgZGltZW5zaW9ucyBmcm9tIHZpZXcgc2l6ZVxuXHRcdHZhciByYXRpbyA9IHcvaDtcblx0XHR2YXIgaGVpZ2h0ID0gTWF0aC5zcXJ0KCAodGhpcy5fdmlld1NpemUqdGhpcy5fdmlld1NpemUpIC8gKHJhdGlvKnJhdGlvICsgMSkgKTtcblx0XHR2YXIgd2lkdGggPSByYXRpbyAqIGhlaWdodDtcblxuXHRcdC8vIHNldCBmcnVzdHJ1bSBlZGdlc1xuXHRcdHRoaXMubGVmdCA9IC13aWR0aC8yO1xuXHRcdHRoaXMucmlnaHQgPSB3aWR0aC8yO1xuXHRcdHRoaXMudG9wID0gaGVpZ2h0LzI7XG5cdFx0dGhpcy5ib3R0b20gPSAtaGVpZ2h0LzI7XG5cblx0XHR0aGlzLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcblxuXHRcdC8vIHVwZGF0ZSBwb3NpdGlvblxuXHRcdHRoaXMucG9zaXRpb24uY29weSh0aGlzLl9mb2N1cykuc3ViKCB0aGlzLl9sb29rRGlyZWN0aW9uLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoMjAwKSApO1xuXHRcdGlmKCBNYXRoLmFicyggdGhpcy5fbG9va0RpcmVjdGlvbi5ub3JtYWxpemUoKS5kb3QobmV3IFRIUkVFLlZlY3RvcjMoMCwtMSwwKSkgKSA9PT0gMSApXG5cdFx0XHR0aGlzLnVwLnNldCgwLDAsMSk7IC8vIGlmIHdlJ3JlIGxvb2tpbmcgZG93biB0aGUgWSBheGlzXG5cdFx0ZWxzZVxuXHRcdFx0dGhpcy51cC5zZXQoMCwxLDApO1xuXHRcdHRoaXMubG9va0F0KCB0aGlzLl9mb2N1cyApO1xuXG5cdFx0d2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKCdkaW9yYW1hVmlld1NldHRpbmdzJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0Zm9jdXM6IHRoaXMuX2ZvY3VzLnRvQXJyYXkoKSxcblx0XHRcdHZpZXdTaXplOiB0aGlzLl92aWV3U2l6ZSxcblx0XHRcdGxvb2tEaXJlY3Rpb246IHRoaXMuX2xvb2tEaXJlY3Rpb24udG9BcnJheSgpXG5cdFx0fSkpO1xuXHR9XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbmltcG9ydCAqIGFzIExvYWRlcnMgZnJvbSAnLi9sb2FkZXJzJztcbmltcG9ydCBQcmV2aWV3Q2FtZXJhIGZyb20gJy4vY2FtZXJhJztcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRGlvcmFtYVxue1xuXHRjb25zdHJ1Y3Rvcih7YmdDb2xvcj0weGFhYWFhYSwgZ3JpZE9mZnNldD1bMCwwLDBdLCBmdWxsc3BhY2U9ZmFsc2V9ID0ge30pXG5cdHtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0c2VsZi5fY2FjaGUgPSBMb2FkZXJzLl9jYWNoZTtcblx0XHRzZWxmLnNjZW5lID0gbmV3IFRIUkVFLlNjZW5lKCk7XG5cblx0XHQvLyBzZXQgdXAgcmVuZGVyZXIgYW5kIHNjYWxlXG5cdFx0aWYoYWx0c3BhY2UuaW5DbGllbnQpXG5cdFx0e1xuXHRcdFx0c2VsZi5yZW5kZXJlciA9IGFsdHNwYWNlLmdldFRocmVlSlNSZW5kZXJlcigpO1xuXHRcdFx0c2VsZi5fZW52UHJvbWlzZSA9IFByb21pc2UuYWxsKFthbHRzcGFjZS5nZXRFbmNsb3N1cmUoKSwgYWx0c3BhY2UuZ2V0U3BhY2UoKV0pXG5cdFx0XHQudGhlbigoW2UsIHNdKSA9PiB7XG5cblx0XHRcdFx0ZnVuY3Rpb24gYWRqdXN0U2NhbGUoKXtcblx0XHRcdFx0XHRzZWxmLnNjZW5lLnNjYWxlLnNldFNjYWxhcihlLnBpeGVsc1Blck1ldGVyKTtcblx0XHRcdFx0XHRzZWxmLmVudiA9IE9iamVjdC5mcmVlemUoT2JqZWN0LmFzc2lnbih7fSwgZSwgcykpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFkanVzdFNjYWxlKCk7XG5cblx0XHRcdFx0aWYoZnVsbHNwYWNlKXtcblx0XHRcdFx0XHRzZWxmLl9mc1Byb21pc2UgPSBlLnJlcXVlc3RGdWxsc3BhY2UoKS5jYXRjaCgoZSkgPT4gY29uc29sZS5sb2coJ1JlcXVlc3QgZm9yIGZ1bGxzcGFjZSBkZW5pZWQnKSk7XG5cdFx0XHRcdFx0ZS5hZGRFdmVudExpc3RlbmVyKCdmdWxsc3BhY2VjaGFuZ2UnLCBhZGp1c3RTY2FsZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZVxuXHRcdFx0XHRcdHNlbGYuX2ZzUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGVsc2Vcblx0XHR7XG5cdFx0XHQvLyBzZXQgdXAgcHJldmlldyByZW5kZXJlciwgaW4gY2FzZSB3ZSdyZSBvdXQgb2Ygd29ybGRcblx0XHRcdHNlbGYucmVuZGVyZXIgPSBuZXcgVEhSRUUuV2ViR0xSZW5kZXJlcigpO1xuXHRcdFx0c2VsZi5yZW5kZXJlci5zZXRTaXplKGRvY3VtZW50LmJvZHkuY2xpZW50V2lkdGgsIGRvY3VtZW50LmJvZHkuY2xpZW50SGVpZ2h0KTtcblx0XHRcdHNlbGYucmVuZGVyZXIuc2V0Q2xlYXJDb2xvciggYmdDb2xvciApO1xuXHRcdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChzZWxmLnJlbmRlcmVyLmRvbUVsZW1lbnQpO1xuXG5cdFx0XHRzZWxmLnByZXZpZXdDYW1lcmEgPSBuZXcgUHJldmlld0NhbWVyYSgpO1xuXHRcdFx0c2VsZi5wcmV2aWV3Q2FtZXJhLmdyaWRIZWxwZXIucG9zaXRpb24uZnJvbUFycmF5KGdyaWRPZmZzZXQpO1xuXHRcdFx0c2VsZi5zY2VuZS5hZGQoc2VsZi5wcmV2aWV3Q2FtZXJhLCBzZWxmLnByZXZpZXdDYW1lcmEuZ3JpZEhlbHBlcik7XG5cdFx0XHRzZWxmLnByZXZpZXdDYW1lcmEucmVnaXN0ZXJIb29rcyhzZWxmLnJlbmRlcmVyKTtcblxuXHRcdFx0Ly8gc2V0IHVwIGN1cnNvciBlbXVsYXRpb25cblx0XHRcdGFsdHNwYWNlLnV0aWxpdGllcy5zaGltcy5jdXJzb3IuaW5pdChzZWxmLnNjZW5lLCBzZWxmLnByZXZpZXdDYW1lcmEsIHtyZW5kZXJlcjogc2VsZi5yZW5kZXJlcn0pO1xuXG5cdFx0XHQvLyBzdHViIGVudmlyb25tZW50XG5cdFx0XHRzZWxmLmVudiA9IE9iamVjdC5mcmVlemUoe1xuXHRcdFx0XHRpbm5lcldpZHRoOiAxMDI0LFxuXHRcdFx0XHRpbm5lckhlaWdodDogMTAyNCxcblx0XHRcdFx0aW5uZXJEZXB0aDogMTAyNCxcblx0XHRcdFx0cGl4ZWxzUGVyTWV0ZXI6IGZ1bGxzcGFjZSA/IDEgOiAxMDI0LzMsXG5cdFx0XHRcdHNpZDogJ2Jyb3dzZXInLFxuXHRcdFx0XHRuYW1lOiAnYnJvd3NlcicsXG5cdFx0XHRcdHRlbXBsYXRlU2lkOiAnYnJvd3Nlcidcblx0XHRcdH0pO1xuXG5cdFx0XHRzZWxmLl9lbnZQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRzZWxmLl9mc1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cdH1cblxuXG5cdHN0YXJ0KC4uLm1vZHVsZXMpXG5cdHtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0XHQvLyBkZXRlcm1pbmUgd2hpY2ggYXNzZXRzIGFyZW4ndCBzaGFyZWRcblx0XHR2YXIgc2luZ2xldG9ucyA9IHt9O1xuXHRcdG1vZHVsZXMuZm9yRWFjaChtb2QgPT5cblx0XHR7XG5cdFx0XHRmdW5jdGlvbiBjaGVja0Fzc2V0KHVybCl7XG5cdFx0XHRcdGlmKHNpbmdsZXRvbnNbdXJsXSA9PT0gdW5kZWZpbmVkKSBzaW5nbGV0b25zW3VybF0gPSB0cnVlO1xuXHRcdFx0XHRlbHNlIGlmKHNpbmdsZXRvbnNbdXJsXSA9PT0gdHJ1ZSkgc2luZ2xldG9uc1t1cmxdID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRPYmplY3Qua2V5cyhtb2QuYXNzZXRzLnRleHR1cmVzIHx8IHt9KS5tYXAoayA9PiBtb2QuYXNzZXRzLnRleHR1cmVzW2tdKS5mb3JFYWNoKGNoZWNrQXNzZXQpO1xuXHRcdFx0T2JqZWN0LmtleXMobW9kLmFzc2V0cy5tb2RlbHMgfHwge30pLm1hcChrID0+IG1vZC5hc3NldHMubW9kZWxzW2tdKS5mb3JFYWNoKGNoZWNrQXNzZXQpO1xuXHRcdFx0T2JqZWN0LmtleXMobW9kLmFzc2V0cy5wb3N0ZXJzIHx8IHt9KS5tYXAoayA9PiBtb2QuYXNzZXRzLnBvc3RlcnNba10pLmZvckVhY2goY2hlY2tBc3NldCk7XG5cdFx0fSk7XG5cblx0XHQvLyBkZXRlcm1pbmUgaWYgdGhlIHRyYWNraW5nIHNrZWxldG9uIGlzIG5lZWRlZFxuXHRcdGxldCBuZWVkc1NrZWxldG9uID0gbW9kdWxlcy5yZWR1Y2UoKG5zLG0pID0+IG5zIHx8IG0ubmVlZHNTa2VsZXRvbiwgZmFsc2UpO1xuXHRcdGlmKG5lZWRzU2tlbGV0b24gJiYgYWx0c3BhY2UuaW5DbGllbnQpe1xuXHRcdFx0c2VsZi5fc2tlbFByb21pc2UgPSBhbHRzcGFjZS5nZXRUaHJlZUpTVHJhY2tpbmdTa2VsZXRvbigpLnRoZW4oc2tlbCA9PiB7XG5cdFx0XHRcdHNlbGYuc2NlbmUuYWRkKHNrZWwpO1xuXHRcdFx0XHRzZWxmLmVudi5za2VsID0gc2tlbDtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRlbHNlXG5cdFx0XHRzZWxmLl9za2VsUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0UHJvbWlzZS5hbGwoW3NlbGYuX2VudlByb21pc2UsIHNlbGYuX2ZzUHJvbWlzZSwgc2VsZi5fc2tlbFByb21pc2VdKS50aGVuKCgpID0+XG5cdFx0e1xuXHRcdFx0Ly8gY29uc3RydWN0IGRpb3JhbWFzXG5cdFx0XHRtb2R1bGVzLmZvckVhY2goZnVuY3Rpb24obW9kdWxlKVxuXHRcdFx0e1xuXHRcdFx0XHRsZXQgcm9vdCA9IG51bGw7XG5cblx0XHRcdFx0aWYobW9kdWxlIGluc3RhbmNlb2YgVEhSRUUuT2JqZWN0M0Qpe1xuXHRcdFx0XHRcdHJvb3QgPSBtb2R1bGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZVxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cm9vdCA9IG5ldyBUSFJFRS5PYmplY3QzRCgpO1xuXG5cdFx0XHRcdFx0Ly8gaGFuZGxlIGFic29sdXRlIHBvc2l0aW9uaW5nXG5cdFx0XHRcdFx0aWYobW9kdWxlLnRyYW5zZm9ybSl7XG5cdFx0XHRcdFx0XHRyb290Lm1hdHJpeC5mcm9tQXJyYXkobW9kdWxlLnRyYW5zZm9ybSk7XG5cdFx0XHRcdFx0XHRyb290Lm1hdHJpeC5kZWNvbXBvc2Uocm9vdC5wb3NpdGlvbiwgcm9vdC5xdWF0ZXJuaW9uLCByb290LnNjYWxlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHRpZihtb2R1bGUucG9zaXRpb24pe1xuXHRcdFx0XHRcdFx0XHRyb290LnBvc2l0aW9uLmZyb21BcnJheShtb2R1bGUucG9zaXRpb24pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYobW9kdWxlLnJvdGF0aW9uKXtcblx0XHRcdFx0XHRcdFx0cm9vdC5yb3RhdGlvbi5mcm9tQXJyYXkobW9kdWxlLnJvdGF0aW9uKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBoYW5kbGUgcmVsYXRpdmUgcG9zaXRpb25pbmdcblx0XHRcdFx0aWYobW9kdWxlLnZlcnRpY2FsQWxpZ24pe1xuXHRcdFx0XHRcdGxldCBoYWxmSGVpZ2h0ID0gc2VsZi5lbnYuaW5uZXJIZWlnaHQvKDIqc2VsZi5lbnYucGl4ZWxzUGVyTWV0ZXIpO1xuXHRcdFx0XHRcdHN3aXRjaChtb2R1bGUudmVydGljYWxBbGlnbil7XG5cdFx0XHRcdFx0Y2FzZSAndG9wJzpcblx0XHRcdFx0XHRcdHJvb3QudHJhbnNsYXRlWShoYWxmSGVpZ2h0KTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2JvdHRvbSc6XG5cdFx0XHRcdFx0XHRyb290LnRyYW5zbGF0ZVkoLWhhbGZIZWlnaHQpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnbWlkZGxlJzpcblx0XHRcdFx0XHRcdC8vIGRlZmF1bHRcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRjb25zb2xlLndhcm4oJ0ludmFsaWQgdmFsdWUgZm9yIFwidmVydGljYWxBbGlnblwiIC0gJywgbW9kdWxlLnZlcnRpY2FsQWxpZ24pO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0c2VsZi5zY2VuZS5hZGQocm9vdCk7XG5cblx0XHRcdFx0aWYoc2VsZi5wcmV2aWV3Q2FtZXJhKXtcblx0XHRcdFx0XHRyb290LmFkZCggbmV3IFRIUkVFLkF4aXNIZWxwZXIoMSkgKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHNlbGYubG9hZEFzc2V0cyhtb2R1bGUuYXNzZXRzLCBzaW5nbGV0b25zKS50aGVuKChyZXN1bHRzKSA9PiB7XG5cdFx0XHRcdFx0bW9kdWxlLmluaXRpYWxpemUoc2VsZi5lbnYsIHJvb3QsIHJlc3VsdHMpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0Ly8gc3RhcnQgYW5pbWF0aW5nXG5cdFx0d2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZShmdW5jdGlvbiBhbmltYXRlKHRpbWVzdGFtcClcblx0XHR7XG5cdFx0XHR3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKGFuaW1hdGUpO1xuXHRcdFx0c2VsZi5zY2VuZS51cGRhdGVBbGxCZWhhdmlvcnMoKTtcblx0XHRcdGlmKHdpbmRvdy5UV0VFTikgVFdFRU4udXBkYXRlKCk7XG5cdFx0XHRzZWxmLnJlbmRlcmVyLnJlbmRlcihzZWxmLnNjZW5lLCBzZWxmLnByZXZpZXdDYW1lcmEpO1xuXHRcdH0pO1xuXHR9XG5cblx0bG9hZEFzc2V0cyhtYW5pZmVzdCwgc2luZ2xldG9ucylcblx0e1xuXHRcdHZhciBzZWxmID0gdGhpcztcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PlxuXHRcdHtcblx0XHRcdC8vIHBvcHVsYXRlIGNhY2hlXG5cdFx0XHRQcm9taXNlLmFsbChbXG5cblx0XHRcdFx0Ly8gcG9wdWxhdGUgbW9kZWwgY2FjaGVcblx0XHRcdFx0Li4uT2JqZWN0LmtleXMobWFuaWZlc3QubW9kZWxzIHx8IHt9KS5tYXAoaWQgPT4gTG9hZGVycy5Nb2RlbFByb21pc2UobWFuaWZlc3QubW9kZWxzW2lkXSkpLFxuXG5cdFx0XHRcdC8vIHBvcHVsYXRlIGV4cGxpY2l0IHRleHR1cmUgY2FjaGVcblx0XHRcdFx0Li4uT2JqZWN0LmtleXMobWFuaWZlc3QudGV4dHVyZXMgfHwge30pLm1hcChpZCA9PiBMb2FkZXJzLlRleHR1cmVQcm9taXNlKG1hbmlmZXN0LnRleHR1cmVzW2lkXSkpLFxuXG5cdFx0XHRcdC8vIGdlbmVyYXRlIGFsbCBwb3N0ZXJzXG5cdFx0XHRcdC4uLk9iamVjdC5rZXlzKG1hbmlmZXN0LnBvc3RlcnMgfHwge30pLm1hcChpZCA9PiBMb2FkZXJzLlBvc3RlclByb21pc2UobWFuaWZlc3QucG9zdGVyc1tpZF0pKVxuXHRcdFx0XSlcblxuXHRcdFx0LnRoZW4oKCkgPT5cblx0XHRcdHtcblx0XHRcdFx0Ly8gcG9wdWxhdGUgcGF5bG9hZCBmcm9tIGNhY2hlXG5cdFx0XHRcdHZhciBwYXlsb2FkID0ge21vZGVsczoge30sIHRleHR1cmVzOiB7fSwgcG9zdGVyczoge319O1xuXG5cdFx0XHRcdGZvcihsZXQgaSBpbiBtYW5pZmVzdC5tb2RlbHMpe1xuXHRcdFx0XHRcdGxldCB1cmwgPSBtYW5pZmVzdC5tb2RlbHNbaV07XG5cdFx0XHRcdFx0bGV0IHQgPSBMb2FkZXJzLl9jYWNoZS5tb2RlbHNbdXJsXTtcblx0XHRcdFx0XHRwYXlsb2FkLm1vZGVsc1tpXSA9IHQgPyBzaW5nbGV0b25zW3VybF0gPyB0IDogdC5jbG9uZSgpIDogbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvcihsZXQgaSBpbiBtYW5pZmVzdC50ZXh0dXJlcyl7XG5cdFx0XHRcdFx0bGV0IHVybCA9IG1hbmlmZXN0LnRleHR1cmVzW2ldO1xuXHRcdFx0XHRcdGxldCB0ID0gTG9hZGVycy5fY2FjaGUudGV4dHVyZXNbdXJsXTtcblx0XHRcdFx0XHRwYXlsb2FkLnRleHR1cmVzW2ldID0gdCA/IHNpbmdsZXRvbnNbdXJsXSA/IHQgOiB0LmNsb25lKCkgOiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Zm9yKGxldCBpIGluIG1hbmlmZXN0LnBvc3RlcnMpe1xuXHRcdFx0XHRcdGxldCB1cmwgPSBtYW5pZmVzdC5wb3N0ZXJzW2ldO1xuXHRcdFx0XHRcdGxldCB0ID0gTG9hZGVycy5fY2FjaGUucG9zdGVyc1t1cmxdO1xuXHRcdFx0XHRcdHBheWxvYWQucG9zdGVyc1tpXSA9IHQgPyBzaW5nbGV0b25zW3VybF0gPyB0IDogdC5jbG9uZSgpIDogbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJlc29sdmUocGF5bG9hZCk7XG5cdFx0XHR9KVxuXHRcdFx0LmNhdGNoKGUgPT4gY29uc29sZS5lcnJvcihlKSk7XG5cdFx0fSk7XG5cdH1cblxufTtcbiJdLCJuYW1lcyI6WyJsZXQiLCJsb2FkZXIiLCJzdXBlciIsInJpZ2h0IiwiTG9hZGVycy5fY2FjaGUiLCJMb2FkZXJzLk1vZGVsUHJvbWlzZSIsIkxvYWRlcnMuVGV4dHVyZVByb21pc2UiLCJMb2FkZXJzLlBvc3RlclByb21pc2UiLCJpIiwidXJsIiwidCJdLCJtYXBwaW5ncyI6Ijs7O0FBRUFBLElBQUksS0FBSyxHQUFHLENBQUMsTUFBTSxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQzs7QUFFcEQsU0FBUyxZQUFZLENBQUMsR0FBRztBQUN6QjtDQUNDLE9BQU8sSUFBSSxPQUFPLENBQUMsVUFBQyxPQUFPLEVBQUUsTUFBTSxFQUFFO0VBRXBDLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztHQUNwQixPQUFPLE9BQU8sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7R0FDbEM7OztPQUdJLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztHQUM1QixHQUFHLEtBQUssQ0FBQyxVQUFVLENBQUM7SUFDbkJBLElBQUksTUFBTSxHQUFHLElBQUksS0FBSyxDQUFDLFVBQVUsRUFBRSxDQUFDO0lBQ3BDLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLFVBQUMsTUFBTSxFQUFFO0tBQ3pCLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsTUFBTSxDQUFDLEtB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TyxDQUFDLFVBQUEsR0FBRyxFQUFDO0VBRXBCLFNBQVUsVUFBVSxDQUFDLEdBQUcsQ0FBQztHQUN4QixHQUFJLFVBQVUsQ0FBQyxHQUFHLENBQUMsS0FBSyxTQUFTLEVBQUUsRUFBQSxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLEVBQUE7UUFDcEQsR0FBRyxVQUFVLENBQUMsR0FBRyxDQUFDLEtBQUssSUFBSSxFQUFFLEVBQUEsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEtBQUssQ0FBQyxFQUFBO0dBQzFEO0VBQ0YsTUFBTyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLFFBQVEsSUFBSSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsVUFBQSxDQUFDLEVBQUMsU0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBQSxDQUFDLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0VBQzdGLE1BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLElBQUksRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLFVBQUEsQ0FBQyxFQUFDLFNBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztFQUN6RixNQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsT0FBTyxJQUFJLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxVQUFBLENBQUMsRUFBQyxTQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFBLENBQUMsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7RUFDMUYsQ0FBQyxDQUFDOzs7Q0FHSixJQUFLLGFBQWEsR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLFVBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxTQUFHLEVBQUUsSUFBSSxDQUFDLENBQUMsYUFBYSxHQUFB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
