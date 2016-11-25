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
				return Promise.resolve(cache.posters[url]);
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
		});
	});
};

return Diorama;

}());
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjpudWxsLCJzb3VyY2VzIjpbIi4uL3NyYy9sb2FkZXJzLmpzIiwiLi4vc3JjL2NhbWVyYS5qcyIsIi4uL3NyYy9tYWluLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcblxubGV0IGNhY2hlID0ge21vZGVsczoge30sIHRleHR1cmVzOiB7fSwgcG9zdGVyczoge319O1xuXG5mdW5jdGlvbiBNb2RlbFByb21pc2UodXJsKVxue1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT5cblx0e1xuXHRcdGlmKGNhY2hlLm1vZGVsc1t1cmxdKXtcblx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLm1vZGVsc1t1cmxdKTtcblx0XHR9XG5cblx0XHQvLyBOT1RFOiBnbFRGIGxvYWRlciBkb2VzIG5vdCBjYXRjaCBlcnJvcnNcblx0XHRlbHNlIGlmKC9cXC5nbHRmJC9pLnRlc3QodXJsKSl7XG5cdFx0XHRpZihUSFJFRS5nbFRGTG9hZGVyKXtcblx0XHRcdFx0bGV0IGxvYWRlciA9IG5ldyBUSFJFRS5nbFRGTG9hZGVyKCk7XG5cdFx0XHRcdGxvYWRlci5sb2FkKHVybCwgKHJlc3VsdCkgPT4ge1xuXHRcdFx0XHRcdGNhY2hlLm1vZGVsc1t1cmxdID0gcmVzdWx0LnNjZW5lLmNoaWxkcmVuWzBdLmNoaWxkcmVuWzBdO1xuXHRcdFx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLm1vZGVsc1t1cmxdKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0Y29uc29sZS5lcnJvcihgVEhSRUUuZ2xURkxvYWRlciBub3QgZm91bmQuIFwiJHt1cmx9XCIgbm90IGxvYWRlZC5gKTtcblx0XHRcdFx0cmVqZWN0KCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZigvXFwuZGFlJC9pLnRlc3QodXJsKSl7XG5cdFx0XHRpZihUSFJFRS5Db2xsYWRhTG9hZGVyKXtcblx0XHRcdFx0bGV0IGxvYWRlciA9IG5ldyBUSFJFRS5Db2xsYWRhTG9hZGVyKCk7XG5cdFx0XHRcdGxvYWRlci5sb2FkKHVybCwgcmVzdWx0ID0+IHtcblx0XHRcdFx0XHRjYWNoZS5tb2RlbHNbdXJsXSA9IHJlc3VsdC5zY2VuZS5jaGlsZHJlblswXTtcblx0XHRcdFx0XHRyZXR1cm4gcmVzb2x2ZShyZXN1bHQuc2NlbmUuY2hpbGRyZW5bMF0pXG5cdFx0XHRcdH0sIG51bGwsIHJlamVjdCk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0Y29uc29sZS5lcnJvcihgVEhSRUUuQ29sbGFkYUxvYWRlciBub3QgZm91bmQuIFwiJHt1cmx9XCIgbm90IGxvYWRlZC5gKTtcblx0XHRcdFx0cmVqZWN0KCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcbn1cblxuZnVuY3Rpb24gVGV4dHVyZVByb21pc2UodXJsKXtcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XG5cdHtcblx0XHRpZihjYWNoZS50ZXh0dXJlc1t1cmxdKVxuXHRcdFx0cmV0dXJuIHJlc29sdmUoY2FjaGUudGV4dHVyZXNbdXJsXSk7XG5cdFx0ZWxzZSB7XG5cdFx0XHRsZXQgbG9hZGVyID0gbmV3IFRIUkVFLlRleHR1cmVMb2FkZXIoKTtcblx0XHRcdGxvYWRlci5sb2FkKHVybCwgdGV4dHVyZSA9PiB7XG5cdFx0XHRcdGNhY2hlLnRleHR1cmVzW3VybF0gPSB0ZXh0dXJlO1xuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZSh0ZXh0dXJlKTtcblx0XHRcdH0sIG51bGwsIHJlamVjdCk7XG5cdFx0fVxuXHR9KTtcbn1cblxuY2xhc3MgVmlkZW9Qcm9taXNlIGV4dGVuZHMgUHJvbWlzZSB7XG5cdGNvbnN0cnVjdG9yKHVybClcblx0e1xuXHRcdC8vIHN0YXJ0IGxvYWRlclxuXHRcdHZhciB2aWRTcmMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd2aWRlbycpO1xuXHRcdHZpZFNyYy5hdXRvcGxheSA9IHRydWU7XG5cdFx0dmlkU3JjLmxvb3AgPSB0cnVlO1xuXHRcdHZpZFNyYy5zcmMgPSB1cmw7XG5cdFx0dmlkU3JjLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh2aWRTcmMpO1xuXG5cdFx0dmFyIHRleCA9IG5ldyBUSFJFRS5WaWRlb1RleHR1cmUodmlkU3JjKTtcblx0XHR0ZXgubWluRmlsdGVyID0gVEhSRUUuTGluZWFyRmlsdGVyO1xuXHRcdHRleC5tYWdGaWx0ZXIgPSBUSFJFRS5MaW5lYXJGaWx0ZXI7XG5cdFx0dGV4LmZvcm1hdCA9IFRIUkVFLlJHQkZvcm1hdDtcblxuXHRcdC8vY2FjaGUudmlkZW9zW3VybF0gPSB0ZXg7XG5cdFx0Ly9wYXlsb2FkLnZpZGVvc1tpZF0gPSBjYWNoZS52aWRlb3NbdXJsXTtcblxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGV4KTtcblx0fVxufVxuXG5mdW5jdGlvbiBQb3N0ZXJQcm9taXNlKHVybCl7XG5cdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PlxuXHR7XG5cdFx0aWYoY2FjaGUucG9zdGVyc1t1cmxdKVxuXHRcdFx0cmV0dXJuIHJlc29sdmUoY2FjaGUucG9zdGVyc1t1cmxdKTtcblx0XHRlbHNlIHJldHVybiAobmV3IFRleHR1cmVQcm9taXNlKHVybCkpLnRoZW4odGV4ID0+XG5cdFx0XHR7XG5cdFx0XHRcdGxldCByYXRpbyA9IHRleC5pbWFnZS53aWR0aCAvIHRleC5pbWFnZS5oZWlnaHQ7XG5cdFx0XHRcdGxldCBnZW8sIG1hdCA9IG5ldyBUSFJFRS5NZXNoQmFzaWNNYXRlcmlhbCh7bWFwOiB0ZXgsIHNpZGU6IFRIUkVFLkRvdWJsZVNpZGV9KTtcblxuXHRcdFx0XHRpZihyYXRpbyA+IDEpe1xuXHRcdFx0XHRcdGdlbyA9IG5ldyBUSFJFRS5QbGFuZUdlb21ldHJ5KDEsIDEvcmF0aW8pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdGdlbyA9IG5ldyBUSFJFRS5QbGFuZUdlb21ldHJ5KHJhdGlvLCAxKTtcblx0XHRcdFx0fVxuXHRcdFx0XG5cdFx0XHRcdGNhY2hlLnBvc3RlcnNbdXJsXSA9IG5ldyBUSFJFRS5NZXNoKGdlbywgbWF0KTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShjYWNoZS5wb3N0ZXJzW3VybF0pO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xufVxuXG5leHBvcnQgeyBNb2RlbFByb21pc2UsIFRleHR1cmVQcm9taXNlLCBWaWRlb1Byb21pc2UsIFBvc3RlclByb21pc2UsIGNhY2hlIGFzIF9jYWNoZSB9O1xuXG4iLCIndXNlIHN0cmljdCc7XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFByZXZpZXdDYW1lcmEgZXh0ZW5kcyBUSFJFRS5PcnRob2dyYXBoaWNDYW1lcmFcbntcblx0Y29uc3RydWN0b3IoZm9jdXMsIHZpZXdTaXplLCBsb29rRGlyZWN0aW9uKVxuXHR7XG5cdFx0c3VwZXIoLTEsIDEsIDEsIC0xLCAuMSwgNDAwKTtcblxuXHRcdGxldCBzZXR0aW5ncyA9IHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnZGlvcmFtYVZpZXdTZXR0aW5ncycpO1xuXHRcdGlmKHNldHRpbmdzKXtcblx0XHRcdHNldHRpbmdzID0gSlNPTi5wYXJzZShzZXR0aW5ncyk7XG5cdFx0XHRpZighZm9jdXMpXG5cdFx0XHRcdGZvY3VzID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5mcm9tQXJyYXkoc2V0dGluZ3MuZm9jdXMpO1xuXHRcdFx0aWYoIXZpZXdTaXplKVxuXHRcdFx0XHR2aWV3U2l6ZSA9IHNldHRpbmdzLnZpZXdTaXplO1xuXHRcdFx0aWYoIWxvb2tEaXJlY3Rpb24pXG5cdFx0XHRcdGxvb2tEaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpLmZyb21BcnJheShzZXR0aW5ncy5sb29rRGlyZWN0aW9uKTtcblx0XHR9XG5cblx0XHR0aGlzLl92aWV3U2l6ZSA9IHZpZXdTaXplIHx8IDQwO1xuXHRcdHRoaXMuX2ZvY3VzID0gZm9jdXMgfHwgbmV3IFRIUkVFLlZlY3RvcjMoKTtcblx0XHR0aGlzLl9sb29rRGlyZWN0aW9uID0gbG9va0RpcmVjdGlvbiB8fCBuZXcgVEhSRUUuVmVjdG9yMygwLC0xLDApO1xuXHRcdHRoaXMuZ3JpZEhlbHBlciA9IG5ldyBUSFJFRS5HcmlkSGVscGVyKDMwMCwgMSk7XG5cdFx0Ly90aGlzLmdyaWRIZWxwZXIucXVhdGVybmlvbi5zZXRGcm9tVW5pdFZlY3RvcnMoIG5ldyBUSFJFRS5WZWN0b3IzKDAsLTEsMCksIHRoaXMuX2xvb2tEaXJlY3Rpb24gKTtcblx0fVxuXG5cdGdldCB2aWV3U2l6ZSgpe1xuXHRcdHJldHVybiB0aGlzLl92aWV3U2l6ZTtcblx0fVxuXHRzZXQgdmlld1NpemUodmFsKXtcblx0XHR0aGlzLl92aWV3U2l6ZSA9IHZhbDtcblx0XHR0aGlzLnJlY29tcHV0ZVZpZXdwb3J0KCk7XG5cdH1cblxuXHRnZXQgZm9jdXMoKXtcblx0XHRyZXR1cm4gdGhpcy5fZm9jdXM7XG5cdH1cblx0c2V0IGZvY3VzKHZhbCl7XG5cdFx0dGhpcy5fZm9jdXMuY29weSh2YWwpO1xuXHRcdHRoaXMucmVjb21wdXRlVmlld3BvcnQoKTtcblx0fVxuXG5cdGdldCBsb29rRGlyZWN0aW9uKCl7XG5cdFx0cmV0dXJuIHRoaXMuX2xvb2tEaXJlY3Rpb247XG5cdH1cblx0c2V0IGxvb2tEaXJlY3Rpb24odmFsKXtcblx0XHR0aGlzLl9sb29rRGlyZWN0aW9uLmNvcHkodmFsKTtcblx0XHR0aGlzLnJlY29tcHV0ZVZpZXdwb3J0KCk7XG5cdH1cblxuXHRyZWdpc3Rlckhvb2tzKHJlbmRlcmVyKVxuXHR7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXHRcdHNlbGYucmVuZGVyZXIgPSByZW5kZXJlcjtcblxuXHRcdC8vIHNldCBzdHlsZXMgb24gdGhlIHBhZ2UsIHNvIHRoZSBwcmV2aWV3IHdvcmtzIHJpZ2h0XG5cdFx0ZG9jdW1lbnQuYm9keS5wYXJlbnRFbGVtZW50LnN0eWxlLmhlaWdodCA9ICcxMDAlJztcblx0XHRkb2N1bWVudC5ib2R5LnN0eWxlLmhlaWdodCA9ICcxMDAlJztcblx0XHRkb2N1bWVudC5ib2R5LnN0eWxlLm1hcmdpbiA9ICcwJztcblx0XHRkb2N1bWVudC5ib2R5LnN0eWxlLm92ZXJmbG93ID0gJ2hpZGRlbic7XG5cblx0XHR2YXIgaW5mbyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3AnKTtcblx0XHRpbmZvLmlubmVySFRNTCA9IFsnTWlkZGxlIGNsaWNrIGFuZCBkcmFnIHRvIHBhbicsICdNb3VzZSB3aGVlbCB0byB6b29tJywgJ0Fycm93IGtleXMgdG8gcm90YXRlJ10uam9pbignPGJyLz4nKTtcblx0XHRPYmplY3QuYXNzaWduKGluZm8uc3R5bGUsIHtcblx0XHRcdHBvc2l0aW9uOiAnZml4ZWQnLFxuXHRcdFx0dG9wOiAnMTBweCcsXG5cdFx0XHRsZWZ0OiAnMTBweCcsXG5cdFx0XHRtYXJnaW46IDBcblx0XHR9KTtcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGluZm8pO1xuXG5cdFx0Ly8gcmVzaXplIHRoZSBwcmV2aWV3IGNhbnZhcyB3aGVuIHdpbmRvdyByZXNpemVzXG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIGUgPT4gc2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpKTtcblx0XHRzZWxmLnJlY29tcHV0ZVZpZXdwb3J0KCk7XG5cblx0XHQvLyBtaWRkbGUgY2xpY2sgYW5kIGRyYWcgdG8gcGFuIHZpZXdcblx0XHR2YXIgZHJhZ1N0YXJ0ID0gbnVsbCwgZm9jdXNTdGFydCA9IG51bGw7XG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIGUgPT4ge1xuXHRcdFx0aWYoZS5idXR0b24gPT09IDEpe1xuXHRcdFx0XHRkcmFnU3RhcnQgPSB7eDogZS5jbGllbnRYLCB5OiBlLmNsaWVudFl9O1xuXHRcdFx0XHRmb2N1c1N0YXJ0ID0gc2VsZi5fZm9jdXMuY2xvbmUoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIGUgPT4ge1xuXHRcdFx0aWYoZS5idXR0b24gPT09IDEpe1xuXHRcdFx0XHRkcmFnU3RhcnQgPSBudWxsO1xuXHRcdFx0XHRmb2N1c1N0YXJ0ID0gbnVsbDtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgZSA9PiB7XG5cdFx0XHRpZihkcmFnU3RhcnQpXG5cdFx0XHR7XG5cdFx0XHRcdGxldCB7Y2xpZW50V2lkdGg6IHcsIGNsaWVudEhlaWdodDogaH0gPSBkb2N1bWVudC5ib2R5O1xuXHRcdFx0XHRsZXQgcGl4ZWxzUGVyTWV0ZXIgPSBNYXRoLnNxcnQodyp3K2gqaCkgLyBzZWxmLl92aWV3U2l6ZTtcblx0XHRcdFx0bGV0IGR4ID0gZS5jbGllbnRYIC0gZHJhZ1N0YXJ0LngsIGR5ID0gZS5jbGllbnRZIC0gZHJhZ1N0YXJ0Lnk7XG5cdFx0XHRcdGxldCByaWdodCA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuY3Jvc3NWZWN0b3JzKHNlbGYuX2xvb2tEaXJlY3Rpb24sIHNlbGYudXApO1xuXG5cdFx0XHRcdHNlbGYuX2ZvY3VzLmNvcHkoZm9jdXNTdGFydClcblx0XHRcdFx0XHQuYWRkKHNlbGYudXAuY2xvbmUoKS5tdWx0aXBseVNjYWxhcihkeS9waXhlbHNQZXJNZXRlcikpXG5cdFx0XHRcdFx0LmFkZChyaWdodC5tdWx0aXBseVNjYWxhcigtZHgvcGl4ZWxzUGVyTWV0ZXIpKTtcblxuXHRcdFx0XHRzZWxmLnJlY29tcHV0ZVZpZXdwb3J0KCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyB3aGVlbCB0byB6b29tXG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3doZWVsJywgZSA9PiB7XG5cdFx0XHRpZihlLmRlbHRhWSA8IDApe1xuXHRcdFx0XHRzZWxmLl92aWV3U2l6ZSAqPSAwLjkwO1xuXHRcdFx0XHRzZWxmLnJlY29tcHV0ZVZpZXdwb3J0KCk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmKGUuZGVsdGFZID4gMCl7XG5cdFx0XHRcdHNlbGYuX3ZpZXdTaXplICo9IDEuMTtcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gYXJyb3cga2V5cyB0byByb3RhdGVcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGUgPT4ge1xuXHRcdFx0aWYoZS5rZXkgPT09ICdBcnJvd0Rvd24nKXtcblx0XHRcdFx0bGV0IHJpZ2h0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5jcm9zc1ZlY3RvcnMoc2VsZi5fbG9va0RpcmVjdGlvbiwgc2VsZi51cCk7XG5cdFx0XHRcdHNlbGYuX2xvb2tEaXJlY3Rpb24uYXBwbHlBeGlzQW5nbGUocmlnaHQsIE1hdGguUEkvMik7XG5cdFx0XHRcdC8vc2VsZi5ncmlkSGVscGVyLnJvdGF0ZU9uQXhpcyhyaWdodCwgTWF0aC5QSS8yKTtcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZihlLmtleSA9PT0gJ0Fycm93VXAnKXtcblx0XHRcdFx0bGV0IHJpZ2h0ID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5jcm9zc1ZlY3RvcnMoc2VsZi5fbG9va0RpcmVjdGlvbiwgc2VsZi51cCk7XG5cdFx0XHRcdHNlbGYuX2xvb2tEaXJlY3Rpb24uYXBwbHlBeGlzQW5nbGUocmlnaHQsIC1NYXRoLlBJLzIpO1xuXHRcdFx0XHQvL3NlbGYuZ3JpZEhlbHBlci5yb3RhdGVPbkF4aXMocmlnaHQsIC1NYXRoLlBJLzIpO1xuXHRcdFx0XHRzZWxmLnJlY29tcHV0ZVZpZXdwb3J0KCk7XG5cblx0XHRcdH1cblx0XHRcdGVsc2UgaWYoZS5rZXkgPT09ICdBcnJvd0xlZnQnKXtcblx0XHRcdFx0c2VsZi5fbG9va0RpcmVjdGlvbi5hcHBseUF4aXNBbmdsZShzZWxmLnVwLCAtTWF0aC5QSS8yKTtcblx0XHRcdFx0Ly9zZWxmLmdyaWRIZWxwZXIucm90YXRlT25BeGlzKHNlbGYudXAsIC1NYXRoLlBJLzIpO1xuXHRcdFx0XHRzZWxmLnJlY29tcHV0ZVZpZXdwb3J0KCk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmKGUua2V5ID09PSAnQXJyb3dSaWdodCcpe1xuXHRcdFx0XHRzZWxmLl9sb29rRGlyZWN0aW9uLmFwcGx5QXhpc0FuZ2xlKHNlbGYudXAsIE1hdGguUEkvMik7XG5cdFx0XHRcdC8vc2VsZi5ncmlkSGVscGVyLnJvdGF0ZU9uQXhpcyhzZWxmLnVwLCBNYXRoLlBJLzIpO1xuXHRcdFx0XHRzZWxmLnJlY29tcHV0ZVZpZXdwb3J0KCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRyZWNvbXB1dGVWaWV3cG9ydCgpXG5cdHtcblx0XHR2YXIge2NsaWVudFdpZHRoOiB3LCBjbGllbnRIZWlnaHQ6IGh9ID0gZG9jdW1lbnQuYm9keTtcblxuXHRcdC8vIHJlc2l6ZSBjYW52YXNcblx0XHR0aGlzLnJlbmRlcmVyLnNldFNpemUodywgaCk7XG5cblx0XHQvLyBjb21wdXRlIHdpbmRvdyBkaW1lbnNpb25zIGZyb20gdmlldyBzaXplXG5cdFx0dmFyIHJhdGlvID0gdy9oO1xuXHRcdHZhciBoZWlnaHQgPSBNYXRoLnNxcnQoICh0aGlzLl92aWV3U2l6ZSp0aGlzLl92aWV3U2l6ZSkgLyAocmF0aW8qcmF0aW8gKyAxKSApO1xuXHRcdHZhciB3aWR0aCA9IHJhdGlvICogaGVpZ2h0O1xuXG5cdFx0Ly8gc2V0IGZydXN0cnVtIGVkZ2VzXG5cdFx0dGhpcy5sZWZ0ID0gLXdpZHRoLzI7XG5cdFx0dGhpcy5yaWdodCA9IHdpZHRoLzI7XG5cdFx0dGhpcy50b3AgPSBoZWlnaHQvMjtcblx0XHR0aGlzLmJvdHRvbSA9IC1oZWlnaHQvMjtcblxuXHRcdHRoaXMudXBkYXRlUHJvamVjdGlvbk1hdHJpeCgpO1xuXG5cdFx0Ly8gdXBkYXRlIHBvc2l0aW9uXG5cdFx0dGhpcy5wb3NpdGlvbi5jb3B5KHRoaXMuX2ZvY3VzKS5zdWIoIHRoaXMuX2xvb2tEaXJlY3Rpb24uY2xvbmUoKS5tdWx0aXBseVNjYWxhcigyMDApICk7XG5cdFx0aWYoIE1hdGguYWJzKCB0aGlzLl9sb29rRGlyZWN0aW9uLm5vcm1hbGl6ZSgpLmRvdChuZXcgVEhSRUUuVmVjdG9yMygwLC0xLDApKSApID09PSAxIClcblx0XHRcdHRoaXMudXAuc2V0KDAsMCwxKTsgLy8gaWYgd2UncmUgbG9va2luZyBkb3duIHRoZSBZIGF4aXNcblx0XHRlbHNlXG5cdFx0XHR0aGlzLnVwLnNldCgwLDEsMCk7XG5cdFx0dGhpcy5sb29rQXQoIHRoaXMuX2ZvY3VzICk7XG5cblx0XHR3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2Rpb3JhbWFWaWV3U2V0dGluZ3MnLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRmb2N1czogdGhpcy5fZm9jdXMudG9BcnJheSgpLFxuXHRcdFx0dmlld1NpemU6IHRoaXMuX3ZpZXdTaXplLFxuXHRcdFx0bG9va0RpcmVjdGlvbjogdGhpcy5fbG9va0RpcmVjdGlvbi50b0FycmF5KClcblx0XHR9KSk7XG5cdH1cbn1cbiIsIid1c2Ugc3RyaWN0JztcblxuaW1wb3J0ICogYXMgTG9hZGVycyBmcm9tICcuL2xvYWRlcnMnO1xuaW1wb3J0IFByZXZpZXdDYW1lcmEgZnJvbSAnLi9jYW1lcmEnO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBEaW9yYW1hXG57XG5cdGNvbnN0cnVjdG9yKHtiZ0NvbG9yPTB4YWFhYWFhLCBncmlkT2Zmc2V0PVswLDAsMF0sIGZ1bGxzcGFjZT1mYWxzZX0gPSB7fSlcblx0e1xuXHRcdHZhciBzZWxmID0gdGhpcztcblxuXHRcdHNlbGYuc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcblxuXHRcdC8vIHNldCB1cCByZW5kZXJlciBhbmQgc2NhbGVcblx0XHRpZihhbHRzcGFjZS5pbkNsaWVudClcblx0XHR7XG5cdFx0XHRzZWxmLnJlbmRlcmVyID0gYWx0c3BhY2UuZ2V0VGhyZWVKU1JlbmRlcmVyKCk7XG5cdFx0XHRzZWxmLl9lbnZQcm9taXNlID0gUHJvbWlzZS5hbGwoW2FsdHNwYWNlLmdldEVuY2xvc3VyZSgpLCBhbHRzcGFjZS5nZXRTcGFjZSgpXSlcblx0XHRcdC50aGVuKGZ1bmN0aW9uKFtlLCBzXSl7XG5cdFx0XHRcdHNlbGYuZW52ID0gT2JqZWN0LmZyZWV6ZShPYmplY3QuYXNzaWduKHt9LCBlLCBzKSk7XG5cdFx0XHRcdHNlbGYuc2NlbmUuc2NhbGUubXVsdGlwbHlTY2FsYXIoZS5waXhlbHNQZXJNZXRlcik7XG5cblx0XHRcdFx0aWYoZnVsbHNwYWNlKXtcblx0XHRcdFx0XHRlLnJlcXVlc3RGdWxsc3BhY2UoKS5jYXRjaCgoZSkgPT4gY29uc29sZS5sb2coJ1JlcXVlc3QgZm9yIGZ1bGxzcGFjZSBkZW5pZWQnKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0XHRlbHNlXG5cdFx0e1xuXHRcdFx0Ly8gc2V0IHVwIHByZXZpZXcgcmVuZGVyZXIsIGluIGNhc2Ugd2UncmUgb3V0IG9mIHdvcmxkXG5cdFx0XHRzZWxmLnJlbmRlcmVyID0gbmV3IFRIUkVFLldlYkdMUmVuZGVyZXIoKTtcblx0XHRcdHNlbGYucmVuZGVyZXIuc2V0U2l6ZShkb2N1bWVudC5ib2R5LmNsaWVudFdpZHRoLCBkb2N1bWVudC5ib2R5LmNsaWVudEhlaWdodCk7XG5cdFx0XHRzZWxmLnJlbmRlcmVyLnNldENsZWFyQ29sb3IoIGJnQ29sb3IgKTtcblx0XHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoc2VsZi5yZW5kZXJlci5kb21FbGVtZW50KTtcblx0XHRcblx0XHRcdHNlbGYucHJldmlld0NhbWVyYSA9IG5ldyBQcmV2aWV3Q2FtZXJhKCk7XG5cdFx0XHRzZWxmLnByZXZpZXdDYW1lcmEuZ3JpZEhlbHBlci5wb3NpdGlvbi5mcm9tQXJyYXkoZ3JpZE9mZnNldCk7XG5cdFx0XHRzZWxmLnNjZW5lLmFkZChzZWxmLnByZXZpZXdDYW1lcmEsIHNlbGYucHJldmlld0NhbWVyYS5ncmlkSGVscGVyKTtcblx0XHRcdHNlbGYucHJldmlld0NhbWVyYS5yZWdpc3Rlckhvb2tzKHNlbGYucmVuZGVyZXIpO1xuXG5cdFx0XHQvLyBzZXQgdXAgY3Vyc29yIGVtdWxhdGlvblxuXHRcdFx0YWx0c3BhY2UudXRpbGl0aWVzLnNoaW1zLmN1cnNvci5pbml0KHNlbGYuc2NlbmUsIHNlbGYucHJldmlld0NhbWVyYSwge3JlbmRlcmVyOiBzZWxmLnJlbmRlcmVyfSk7XG5cdFx0XG5cdFx0XHQvLyBzdHViIGVudmlyb25tZW50XG5cdFx0XHRzZWxmLmVudiA9IE9iamVjdC5mcmVlemUoe1xuXHRcdFx0XHRpbm5lcldpZHRoOiAxMDI0LFxuXHRcdFx0XHRpbm5lckhlaWdodDogMTAyNCxcblx0XHRcdFx0aW5uZXJEZXB0aDogMTAyNCxcblx0XHRcdFx0cGl4ZWxzUGVyTWV0ZXI6IGZ1bGxzcGFjZSA/IDEgOiAxMDI0LzMsXG5cdFx0XHRcdHNpZDogJ2Jyb3dzZXInLFxuXHRcdFx0XHRuYW1lOiAnYnJvd3NlcicsXG5cdFx0XHRcdHRlbXBsYXRlU2lkOiAnYnJvd3Nlcidcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXHRcdFxuXHRcdFxuXHRzdGFydCguLi5tb2R1bGVzKVxuXHR7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdFx0Ly8gbWFrZSBzdXJlIHNwYWNlIGluZm8gaXMgZmlsbGVkIG91dCBiZWZvcmUgaW5pdGlhbGl6YXRpb25cblx0XHRpZighc2VsZi5lbnYpe1xuXHRcdFx0cmV0dXJuIHNlbGYuX2VudlByb21pc2UudGhlbigoKSA9PiB7IHNlbGYuc3RhcnQoLi4ubW9kdWxlcyk7IH0pO1xuXHRcdH1cblxuXHRcdC8vIGRldGVybWluZSB3aGljaCBhc3NldHMgYXJlbid0IHNoYXJlZFxuXHRcdHZhciBzaW5nbGV0b25zID0ge307XG5cdFx0bW9kdWxlcy5mb3JFYWNoKG1vZCA9PlxuXHRcdHtcblx0XHRcdGZ1bmN0aW9uIGNoZWNrQXNzZXQodXJsKXtcblx0XHRcdFx0aWYoc2luZ2xldG9uc1t1cmxdID09PSB1bmRlZmluZWQpIHNpbmdsZXRvbnNbdXJsXSA9IHRydWU7XG5cdFx0XHRcdGVsc2UgaWYoc2luZ2xldG9uc1t1cmxdID09PSB0cnVlKSBzaW5nbGV0b25zW3VybF0gPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdE9iamVjdC5rZXlzKG1vZC5hc3NldHMudGV4dHVyZXMgfHwge30pLm1hcChrID0+IG1vZC5hc3NldHMudGV4dHVyZXNba10pLmZvckVhY2goY2hlY2tBc3NldCk7XG5cdFx0XHRPYmplY3Qua2V5cyhtb2QuYXNzZXRzLm1vZGVscyB8fCB7fSkubWFwKGsgPT4gbW9kLmFzc2V0cy5tb2RlbHNba10pLmZvckVhY2goY2hlY2tBc3NldCk7XG5cdFx0XHRPYmplY3Qua2V5cyhtb2QuYXNzZXRzLnBvc3RlcnMgfHwge30pLm1hcChrID0+IG1vZC5hc3NldHMucG9zdGVyc1trXSkuZm9yRWFjaChjaGVja0Fzc2V0KTtcblx0XHR9KTtcblxuXHRcdC8vIGRldGVybWluZSBpZiB0aGUgdHJhY2tpbmcgc2tlbGV0b24gaXMgbmVlZGVkXG5cdFx0bGV0IG5lZWRzU2tlbGV0b24gPSBtb2R1bGVzLnJlZHVjZSgobnMsbSkgPT4gbnMgfHwgbS5uZWVkc1NrZWxldG9uLCBmYWxzZSk7XG5cdFx0aWYobmVlZHNTa2VsZXRvbiAmJiBhbHRzcGFjZS5pbkNsaWVudCl7XG5cdFx0XHRhbHRzcGFjZS5nZXRUaHJlZUpTVHJhY2tpbmdTa2VsZXRvbigpLnRoZW4oc2tlbCA9PiB7XG5cdFx0XHRcdHNlbGYuc2NlbmUuYWRkKHNrZWwpO1xuXHRcdFx0XHRzZWxmLmVudi5za2VsID0gc2tlbDtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIGNvbnN0cnVjdCBkaW9yYW1hc1xuXHRcdG1vZHVsZXMuZm9yRWFjaChmdW5jdGlvbihtb2R1bGUpXG5cdFx0e1xuXHRcdFx0bGV0IHJvb3QgPSBudWxsO1xuXHRcdFx0XG5cdFx0XHRpZihtb2R1bGUgaW5zdGFuY2VvZiBUSFJFRS5PYmplY3QzRCl7XG5cdFx0XHRcdHJvb3QgPSBtb2R1bGU7XG5cdFx0XHR9XG5cdFx0XHRlbHNlXG5cdFx0XHR7XG5cdFx0XHRcdHJvb3QgPSBuZXcgVEhSRUUuT2JqZWN0M0QoKTtcblxuXHRcdFx0XHQvLyBoYW5kbGUgYWJzb2x1dGUgcG9zaXRpb25pbmdcblx0XHRcdFx0aWYobW9kdWxlLnRyYW5zZm9ybSl7XG5cdFx0XHRcdFx0cm9vdC5tYXRyaXguZnJvbUFycmF5KG1vZHVsZS50cmFuc2Zvcm0pO1xuXHRcdFx0XHRcdHJvb3QubWF0cml4LmRlY29tcG9zZShyb290LnBvc2l0aW9uLCByb290LnF1YXRlcm5pb24sIHJvb3Quc2NhbGUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdGlmKG1vZHVsZS5wb3NpdGlvbil7XG5cdFx0XHRcdFx0XHRyb290LnBvc2l0aW9uLmZyb21BcnJheShtb2R1bGUucG9zaXRpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZihtb2R1bGUucm90YXRpb24pe1xuXHRcdFx0XHRcdFx0cm9vdC5yb3RhdGlvbi5mcm9tQXJyYXkobW9kdWxlLnJvdGF0aW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gaGFuZGxlIHJlbGF0aXZlIHBvc2l0aW9uaW5nXG5cdFx0XHRpZihtb2R1bGUudmVydGljYWxBbGlnbil7XG5cdFx0XHRcdGxldCBoYWxmSGVpZ2h0ID0gc2VsZi5lbnYuaW5uZXJIZWlnaHQvKDIqc2VsZi5lbnYucGl4ZWxzUGVyTWV0ZXIpO1xuXHRcdFx0XHRzd2l0Y2gobW9kdWxlLnZlcnRpY2FsQWxpZ24pe1xuXHRcdFx0XHRjYXNlICd0b3AnOlxuXHRcdFx0XHRcdHJvb3QudHJhbnNsYXRlWShoYWxmSGVpZ2h0KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnYm90dG9tJzpcblx0XHRcdFx0XHRyb290LnRyYW5zbGF0ZVkoLWhhbGZIZWlnaHQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdtaWRkbGUnOlxuXHRcdFx0XHRcdC8vIGRlZmF1bHRcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRjb25zb2xlLndhcm4oJ0ludmFsaWQgdmFsdWUgZm9yIFwidmVydGljYWxBbGlnblwiIC0gJywgbW9kdWxlLnZlcnRpY2FsQWxpZ24pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHNlbGYuc2NlbmUuYWRkKHJvb3QpO1xuXG5cdFx0XHRpZihzZWxmLnByZXZpZXdDYW1lcmEpe1xuXHRcdFx0XHRyb290LmFkZCggbmV3IFRIUkVFLkF4aXNIZWxwZXIoMSkgKTtcblx0XHRcdH1cblx0XHRcblx0XHRcdHNlbGYubG9hZEFzc2V0cyhtb2R1bGUuYXNzZXRzLCBzaW5nbGV0b25zKS50aGVuKChyZXN1bHRzKSA9PiB7XG5cdFx0XHRcdG1vZHVsZS5pbml0aWFsaXplKHNlbGYuZW52LCByb290LCByZXN1bHRzKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdFxuXHRcdC8vIHN0YXJ0IGFuaW1hdGluZ1xuXHRcdHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoZnVuY3Rpb24gYW5pbWF0ZSh0aW1lc3RhbXApXG5cdFx0e1xuXHRcdFx0d2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZShhbmltYXRlKTtcblx0XHRcdHNlbGYuc2NlbmUudXBkYXRlQWxsQmVoYXZpb3JzKCk7XG5cdFx0XHRpZih3aW5kb3cuVFdFRU4pIFRXRUVOLnVwZGF0ZSgpO1xuXHRcdFx0c2VsZi5yZW5kZXJlci5yZW5kZXIoc2VsZi5zY2VuZSwgc2VsZi5wcmV2aWV3Q2FtZXJhKTtcblx0XHR9KTtcblx0fVxuXG5cdGxvYWRBc3NldHMobWFuaWZlc3QsIHNpbmdsZXRvbnMpXG5cdHtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT5cblx0XHR7XG5cdFx0XHQvLyBwb3B1bGF0ZSBjYWNoZVxuXHRcdFx0UHJvbWlzZS5hbGwoW1xuXG5cdFx0XHRcdC8vIHBvcHVsYXRlIG1vZGVsIGNhY2hlXG5cdFx0XHRcdC4uLk9iamVjdC5rZXlzKG1hbmlmZXN0Lm1vZGVscyB8fCB7fSkubWFwKGlkID0+IExvYWRlcnMuTW9kZWxQcm9taXNlKG1hbmlmZXN0Lm1vZGVsc1tpZF0pKSxcblxuXHRcdFx0XHQvLyBwb3B1bGF0ZSBleHBsaWNpdCB0ZXh0dXJlIGNhY2hlXG5cdFx0XHRcdC4uLk9iamVjdC5rZXlzKG1hbmlmZXN0LnRleHR1cmVzIHx8IHt9KS5tYXAoaWQgPT4gTG9hZGVycy5UZXh0dXJlUHJvbWlzZShtYW5pZmVzdC50ZXh0dXJlc1tpZF0pKSxcblxuXHRcdFx0XHQvLyBnZW5lcmF0ZSBhbGwgcG9zdGVyc1xuXHRcdFx0XHQuLi5PYmplY3Qua2V5cyhtYW5pZmVzdC5wb3N0ZXJzIHx8IHt9KS5tYXAoaWQgPT4gTG9hZGVycy5Qb3N0ZXJQcm9taXNlKG1hbmlmZXN0LnBvc3RlcnNbaWRdKSlcblx0XHRcdF0pXG5cblx0XHRcdC50aGVuKCgpID0+XG5cdFx0XHR7XG5cdFx0XHRcdC8vIHBvcHVsYXRlIHBheWxvYWQgZnJvbSBjYWNoZVxuXHRcdFx0XHR2YXIgcGF5bG9hZCA9IHttb2RlbHM6IHt9LCB0ZXh0dXJlczoge30sIHBvc3RlcnM6IHt9fTtcblxuXHRcdFx0XHRmb3IobGV0IGkgaW4gbWFuaWZlc3QubW9kZWxzKXtcblx0XHRcdFx0XHRsZXQgdXJsID0gbWFuaWZlc3QubW9kZWxzW2ldO1xuXHRcdFx0XHRcdGxldCB0ID0gTG9hZGVycy5fY2FjaGUubW9kZWxzW3VybF07XG5cdFx0XHRcdFx0cGF5bG9hZC5tb2RlbHNbaV0gPSB0ID8gc2luZ2xldG9uc1t1cmxdID8gdCA6IHQuY2xvbmUoKSA6IG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRmb3IobGV0IGkgaW4gbWFuaWZlc3QudGV4dHVyZXMpe1xuXHRcdFx0XHRcdGxldCB1cmwgPSBtYW5pZmVzdC50ZXh0dXJlc1tpXTtcblx0XHRcdFx0XHRsZXQgdCA9IExvYWRlcnMuX2NhY2hlLnRleHR1cmVzW3VybF07XG5cdFx0XHRcdFx0cGF5bG9hZC50ZXh0dXJlc1tpXSA9IHQgPyBzaW5nbGV0b25zW3VybF0gPyB0IDogdC5jbG9uZSgpIDogbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvcihsZXQgaSBpbiBtYW5pZmVzdC5wb3N0ZXJzKXtcblx0XHRcdFx0XHRsZXQgdXJsID0gbWFuaWZlc3QucG9zdGVyc1tpXTtcblx0XHRcdFx0XHRsZXQgdCA9IExvYWRlcnMuX2NhY2hlLnBvc3RlcnNbdXJsXTtcblx0XHRcdFx0XHRwYXlsb2FkLnBvc3RlcnNbaV0gPSB0ID8gc2luZ2xldG9uc1t1cmxdID8gdCA6IHQuY2xvbmUoKSA6IG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXNvbHZlKHBheWxvYWQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxufTtcbiJdLCJuYW1lcyI6WyJsZXQiLCJsb2FkZXIiLCJzdXBlciIsInJpZ2h0IiwiTG9hZGVycy5Nb2RlbFByb21pc2UiLCJMb2FkZXJzLlRleHR1cmVQcm9taXNlIiwiTG9hZGVycy5Qb3N0ZXJQcm9taXNlIiwiTG9hZGVycy5fY2FjaGUiLCJpIiwidXJsIiwidCJdLCJtYXBwaW5ncyI6Ijs7O0FBRUFBLElBQUksS0FBSyxHQUFHLENBQUMsTUFBTSxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQzs7QUFFcEQsU0FBUyxZQUFZLENBQUMsR0FBRztBQUN6QjtDQUNDLE9BQU8sSUFBSSxPQUFPLENBQUMsVUFBQyxPQUFPLEVBQUUsTUFBTSxFQUFFO0VBRXBDLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztHQUNwQixPQUFPLE9BQU8sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7R0FDbEM7OztPQUdJLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztHQUM1QixHQUFHLEtBQUssQ0FBQyxVQUFV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dEMsT0FBUSxDQUFDLFFBQVEsQ0FBQ0QsR0FBQyxDQUFDLEdBQUdFLEdBQUMsR0FBRyxVQUFVLENBQUNELEtBQUcsQ0FBQyxHQUFHQyxHQUFDLEdBQUdBLEdBQUMsQ0FBQyxLQUFLLEVBQUUsR0FBRyxJQUFJLENBQUM7SUFDakU7O0dBRUYsSUFBS1YsSUFBSVEsR0FBQyxJQUFJLFFBQVEsQ0FBQyxPQUFPLENBQUM7SUFDOUIsSUFBS0MsS0FBRyxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUNELEdBQUMsQ0FBQyxDQUFDO0lBQy9CLElBQUtFLEdBQUMsR0FBR0gsS0FBYyxDQUFDLE9BQU8sQ0FBQ0UsS0FBRyxDQUFDLENBQUM7SUFDckMsT0FBUSxDQUFDLE9BQU8sQ0FBQ0QsR0FBQyxDQUFDLEdBQUdFLEdBQUMsR0FBRyxVQUFVLENBQUNELEtBQUcsQ0FBQyxHQUFHQyxHQUFDLEdBQUdBLEdBQUMsQ0FBQyxLQUFLLEVBQUUsR0FBRyxJQUFJLENBQUM7SUFDaEU7O0dBRUYsT0FBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0dBQ2pCLENBQUMsQ0FBQztFQUNILENBQUMsQ0FBQztDQUNILENBQUEsQUFFRCxBQUFDOzs7OyJ9
