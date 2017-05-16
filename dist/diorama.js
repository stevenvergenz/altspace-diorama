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

		else if(/\.obj$/i.test(url)){
			if(THREE.OBJLoader){
				var loader$2 = new THREE.OBJLoader();
				loader$2.load(url, function (model) {
					cache.models[url] = model;
					return resolve(model);
				}, undefined, reject);
			}
			else {
				console.error(("OBJ loader not found. \"" + url + "\" not loaded."));
				reject();
			}
		}

		else if(/\.dae$/i.test(url)){
			if(THREE.ColladaLoader){
				var loader$3 = new THREE.ColladaLoader();
				loader$3.load(url, function (result) {
					cache.models[url] = result.scene.children[0];
					return resolve(result.scene.children[0])
				}, null, reject);
			}
			else {
				console.error(("Collada loader not found. \"" + url + "\" not loaded."));
				reject();
			}
		}

		else {
			console.error('Unrecognized model extension:', url);
			reject();
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
		self._skelPromise = altspace.getThreeJSTrackingSkeleton().then(function (skel) {
			self.scene.add(skel);
			self.env.skel = skel;
			self.env = Object.freeze(self.env);
		});
	}
	else {
		self.env = Object.freeze(self.env);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjpudWxsLCJzb3VyY2VzIjpbIi4uL3NyYy9sb2FkZXJzLmpzIiwiLi4vc3JjL2NhbWVyYS5qcyIsIi4uL3NyYy9tYWluLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0JztcclxuXHJcbmxldCBjYWNoZSA9IHttb2RlbHM6IHt9LCB0ZXh0dXJlczoge30sIHBvc3RlcnM6IHt9fTtcclxuXHJcbmZ1bmN0aW9uIE1vZGVsUHJvbWlzZSh1cmwpXHJcbntcclxuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT5cclxuXHR7XHJcblx0XHRpZihjYWNoZS5tb2RlbHNbdXJsXSl7XHJcblx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLm1vZGVsc1t1cmxdKTtcclxuXHRcdH1cclxuXHJcblx0XHQvLyBOT1RFOiBnbFRGIGxvYWRlciBkb2VzIG5vdCBjYXRjaCBlcnJvcnNcclxuXHRcdGVsc2UgaWYoL1xcLmdsdGYkL2kudGVzdCh1cmwpKXtcclxuXHRcdFx0aWYoVEhSRUUuZ2xURkxvYWRlcil7XHJcblx0XHRcdFx0bGV0IGxvYWRlciA9IG5ldyBUSFJFRS5nbFRGTG9hZGVyKCk7XHJcblx0XHRcdFx0bG9hZGVyLmxvYWQodXJsLCAocmVzdWx0KSA9PiB7XHJcblx0XHRcdFx0XHRjYWNoZS5tb2RlbHNbdXJsXSA9IHJlc3VsdC5zY2VuZS5jaGlsZHJlblswXS5jaGlsZHJlblswXTtcclxuXHRcdFx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLm1vZGVsc1t1cmxdKTtcclxuXHRcdFx0XHR9KTtcclxuXHRcdFx0fVxyXG5cdFx0XHRlbHNlIGlmKFRIUkVFLkdMVEZMb2FkZXIpe1xyXG5cdFx0XHRcdGxldCBsb2FkZXIgPSBuZXcgVEhSRUUuR0xURkxvYWRlcigpO1xyXG5cdFx0XHRcdGxvYWRlci5sb2FkKHVybCwgcmVzdWx0ID0+IHtcclxuXHRcdFx0XHRcdGNhY2hlLm1vZGVsc1t1cmxdID0gcmVzdWx0LnNjZW5lLmNoaWxkcmVuWzBdO1xyXG5cdFx0XHRcdFx0Y2FjaGUubW9kZWxzW3VybF0ubWF0cml4QXV0b1VwZGF0ZSA9IHRydWU7XHJcblx0XHRcdFx0XHQvKnJlc3VsdC5zY2VuZS50cmF2ZXJzZSgobykgPT4ge1xyXG5cdFx0XHRcdFx0XHRpZihvLm1hdGVyaWFsICYmIG8ubWF0ZXJpYWwubWFwKVxyXG5cdFx0XHRcdFx0XHRcdGNvbnNvbGUubG9nKCdmbGlwWScsIG8ubWF0ZXJpYWwubWFwLmZsaXBZKTtcclxuXHRcdFx0XHRcdH0pOyovXHJcblxyXG5cdFx0XHRcdFx0cmV0dXJuIHJlc29sdmUoY2FjaGUubW9kZWxzW3VybF0pO1xyXG5cdFx0XHRcdH0sICgpID0+IHt9LCByZWplY3QpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoYGdsVEYgbG9hZGVyIG5vdCBmb3VuZC4gXCIke3VybH1cIiBub3QgbG9hZGVkLmApO1xyXG5cdFx0XHRcdHJlamVjdCgpO1xyXG5cdFx0XHR9XHJcblx0XHR9XHJcblxyXG5cdFx0ZWxzZSBpZigvXFwub2JqJC9pLnRlc3QodXJsKSl7XHJcblx0XHRcdGlmKFRIUkVFLk9CSkxvYWRlcil7XHJcblx0XHRcdFx0bGV0IGxvYWRlciA9IG5ldyBUSFJFRS5PQkpMb2FkZXIoKTtcclxuXHRcdFx0XHRsb2FkZXIubG9hZCh1cmwsIG1vZGVsID0+IHtcclxuXHRcdFx0XHRcdGNhY2hlLm1vZGVsc1t1cmxdID0gbW9kZWw7XHJcblx0XHRcdFx0XHRyZXR1cm4gcmVzb2x2ZShtb2RlbCk7XHJcblx0XHRcdFx0fSwgdW5kZWZpbmVkLCByZWplY3QpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoYE9CSiBsb2FkZXIgbm90IGZvdW5kLiBcIiR7dXJsfVwiIG5vdCBsb2FkZWQuYCk7XHJcblx0XHRcdFx0cmVqZWN0KCk7XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHJcblx0XHRlbHNlIGlmKC9cXC5kYWUkL2kudGVzdCh1cmwpKXtcclxuXHRcdFx0aWYoVEhSRUUuQ29sbGFkYUxvYWRlcil7XHJcblx0XHRcdFx0bGV0IGxvYWRlciA9IG5ldyBUSFJFRS5Db2xsYWRhTG9hZGVyKCk7XHJcblx0XHRcdFx0bG9hZGVyLmxvYWQodXJsLCByZXN1bHQgPT4ge1xyXG5cdFx0XHRcdFx0Y2FjaGUubW9kZWxzW3VybF0gPSByZXN1bHQuc2NlbmUuY2hpbGRyZW5bMF07XHJcblx0XHRcdFx0XHRyZXR1cm4gcmVzb2x2ZShyZXN1bHQuc2NlbmUuY2hpbGRyZW5bMF0pXHJcblx0XHRcdFx0fSwgbnVsbCwgcmVqZWN0KTtcclxuXHRcdFx0fVxyXG5cdFx0XHRlbHNlIHtcclxuXHRcdFx0XHRjb25zb2xlLmVycm9yKGBDb2xsYWRhIGxvYWRlciBub3QgZm91bmQuIFwiJHt1cmx9XCIgbm90IGxvYWRlZC5gKTtcclxuXHRcdFx0XHRyZWplY3QoKTtcclxuXHRcdFx0fVxyXG5cdFx0fVxyXG5cclxuXHRcdGVsc2Uge1xyXG5cdFx0XHRjb25zb2xlLmVycm9yKCdVbnJlY29nbml6ZWQgbW9kZWwgZXh0ZW5zaW9uOicsIHVybCk7XHJcblx0XHRcdHJlamVjdCgpO1xyXG5cdFx0fVxyXG5cdH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBUZXh0dXJlUHJvbWlzZSh1cmwpe1xyXG5cdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PlxyXG5cdHtcclxuXHRcdGlmKGNhY2hlLnRleHR1cmVzW3VybF0pXHJcblx0XHRcdHJldHVybiByZXNvbHZlKGNhY2hlLnRleHR1cmVzW3VybF0pO1xyXG5cdFx0ZWxzZSB7XHJcblx0XHRcdGxldCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpO1xyXG5cdFx0XHRsb2FkZXIubG9hZCh1cmwsIHRleHR1cmUgPT4ge1xyXG5cdFx0XHRcdGNhY2hlLnRleHR1cmVzW3VybF0gPSB0ZXh0dXJlO1xyXG5cdFx0XHRcdHJldHVybiByZXNvbHZlKHRleHR1cmUpO1xyXG5cdFx0XHR9LCBudWxsLCByZWplY3QpO1xyXG5cdFx0fVxyXG5cdH0pO1xyXG59XHJcblxyXG5jbGFzcyBWaWRlb1Byb21pc2UgZXh0ZW5kcyBQcm9taXNlIHtcclxuXHRjb25zdHJ1Y3Rvcih1cmwpXHJcblx0e1xyXG5cdFx0Ly8gc3RhcnQgbG9hZGVyXHJcblx0XHR2YXIgdmlkU3JjID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndmlkZW8nKTtcclxuXHRcdHZpZFNyYy5hdXRvcGxheSA9IHRydWU7XHJcblx0XHR2aWRTcmMubG9vcCA9IHRydWU7XHJcblx0XHR2aWRTcmMuc3JjID0gdXJsO1xyXG5cdFx0dmlkU3JjLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XHJcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHZpZFNyYyk7XHJcblxyXG5cdFx0dmFyIHRleCA9IG5ldyBUSFJFRS5WaWRlb1RleHR1cmUodmlkU3JjKTtcclxuXHRcdHRleC5taW5GaWx0ZXIgPSBUSFJFRS5MaW5lYXJGaWx0ZXI7XHJcblx0XHR0ZXgubWFnRmlsdGVyID0gVEhSRUUuTGluZWFyRmlsdGVyO1xyXG5cdFx0dGV4LmZvcm1hdCA9IFRIUkVFLlJHQkZvcm1hdDtcclxuXHJcblx0XHQvL2NhY2hlLnZpZGVvc1t1cmxdID0gdGV4O1xyXG5cdFx0Ly9wYXlsb2FkLnZpZGVvc1tpZF0gPSBjYWNoZS52aWRlb3NbdXJsXTtcclxuXHJcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRleCk7XHJcblx0fVxyXG59XHJcblxyXG5mdW5jdGlvbiBQb3N0ZXJQcm9taXNlKHVybCl7XHJcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XHJcblx0e1xyXG5cdFx0aWYoY2FjaGUucG9zdGVyc1t1cmxdKVxyXG5cdFx0XHRyZXR1cm4gcmVzb2x2ZShjYWNoZS5wb3N0ZXJzW3VybF0pO1xyXG5cdFx0ZWxzZSByZXR1cm4gKG5ldyBUZXh0dXJlUHJvbWlzZSh1cmwpKS50aGVuKHRleCA9PlxyXG5cdFx0XHR7XHJcblx0XHRcdFx0bGV0IHJhdGlvID0gdGV4LmltYWdlLndpZHRoIC8gdGV4LmltYWdlLmhlaWdodDtcclxuXHRcdFx0XHRsZXQgZ2VvLCBtYXQgPSBuZXcgVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwoe21hcDogdGV4LCBzaWRlOiBUSFJFRS5Eb3VibGVTaWRlfSk7XHJcblxyXG5cdFx0XHRcdGlmKHJhdGlvID4gMSl7XHJcblx0XHRcdFx0XHRnZW8gPSBuZXcgVEhSRUUuUGxhbmVHZW9tZXRyeSgxLCAxL3JhdGlvKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0XHRnZW8gPSBuZXcgVEhSRUUuUGxhbmVHZW9tZXRyeShyYXRpbywgMSk7XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRjYWNoZS5wb3N0ZXJzW3VybF0gPSBuZXcgVEhSRUUuTWVzaChnZW8sIG1hdCk7XHJcblx0XHRcdFx0cmV0dXJuIHJlc29sdmUoY2FjaGUucG9zdGVyc1t1cmxdKTtcclxuXHRcdFx0fVxyXG5cdFx0KTtcclxuXHR9KTtcclxufVxyXG5cclxuZXhwb3J0IHsgTW9kZWxQcm9taXNlLCBUZXh0dXJlUHJvbWlzZSwgVmlkZW9Qcm9taXNlLCBQb3N0ZXJQcm9taXNlLCBjYWNoZSBhcyBfY2FjaGUgfTtcclxuIiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgUHJldmlld0NhbWVyYSBleHRlbmRzIFRIUkVFLk9ydGhvZ3JhcGhpY0NhbWVyYVxyXG57XHJcblx0Y29uc3RydWN0b3IoZm9jdXMsIHZpZXdTaXplLCBsb29rRGlyZWN0aW9uKVxyXG5cdHtcclxuXHRcdHN1cGVyKC0xLCAxLCAxLCAtMSwgLjEsIDQwMCk7XHJcblxyXG5cdFx0bGV0IHNldHRpbmdzID0gd2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKCdkaW9yYW1hVmlld1NldHRpbmdzJyk7XHJcblx0XHRpZihzZXR0aW5ncyl7XHJcblx0XHRcdHNldHRpbmdzID0gSlNPTi5wYXJzZShzZXR0aW5ncyk7XHJcblx0XHRcdGlmKCFmb2N1cylcclxuXHRcdFx0XHRmb2N1cyA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuZnJvbUFycmF5KHNldHRpbmdzLmZvY3VzKTtcclxuXHRcdFx0aWYoIXZpZXdTaXplKVxyXG5cdFx0XHRcdHZpZXdTaXplID0gc2V0dGluZ3Mudmlld1NpemU7XHJcblx0XHRcdGlmKCFsb29rRGlyZWN0aW9uKVxyXG5cdFx0XHRcdGxvb2tEaXJlY3Rpb24gPSBuZXcgVEhSRUUuVmVjdG9yMygpLmZyb21BcnJheShzZXR0aW5ncy5sb29rRGlyZWN0aW9uKTtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLl92aWV3U2l6ZSA9IHZpZXdTaXplIHx8IDQwO1xyXG5cdFx0dGhpcy5fZm9jdXMgPSBmb2N1cyB8fCBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG5cdFx0dGhpcy5fbG9va0RpcmVjdGlvbiA9IGxvb2tEaXJlY3Rpb24gfHwgbmV3IFRIUkVFLlZlY3RvcjMoMCwtMSwwKTtcclxuXHRcdHRoaXMuZ3JpZEhlbHBlciA9IG5ldyBUSFJFRS5HcmlkSGVscGVyKDMwMCwgMSk7XHJcblx0XHR0aGlzLmdyaWRIZWxwZXIudXNlckRhdGEgPSB7YWx0c3BhY2U6IHtjb2xsaWRlcjoge2VuYWJsZWQ6IGZhbHNlfX19O1xyXG5cdFx0Ly90aGlzLmdyaWRIZWxwZXIucXVhdGVybmlvbi5zZXRGcm9tVW5pdFZlY3RvcnMoIG5ldyBUSFJFRS5WZWN0b3IzKDAsLTEsMCksIHRoaXMuX2xvb2tEaXJlY3Rpb24gKTtcclxuXHR9XHJcblxyXG5cdGdldCB2aWV3U2l6ZSgpe1xyXG5cdFx0cmV0dXJuIHRoaXMuX3ZpZXdTaXplO1xyXG5cdH1cclxuXHRzZXQgdmlld1NpemUodmFsKXtcclxuXHRcdHRoaXMuX3ZpZXdTaXplID0gdmFsO1xyXG5cdFx0dGhpcy5yZWNvbXB1dGVWaWV3cG9ydCgpO1xyXG5cdH1cclxuXHJcblx0Z2V0IGZvY3VzKCl7XHJcblx0XHRyZXR1cm4gdGhpcy5fZm9jdXM7XHJcblx0fVxyXG5cdHNldCBmb2N1cyh2YWwpe1xyXG5cdFx0dGhpcy5fZm9jdXMuY29weSh2YWwpO1xyXG5cdFx0dGhpcy5yZWNvbXB1dGVWaWV3cG9ydCgpO1xyXG5cdH1cclxuXHJcblx0Z2V0IGxvb2tEaXJlY3Rpb24oKXtcclxuXHRcdHJldHVybiB0aGlzLl9sb29rRGlyZWN0aW9uO1xyXG5cdH1cclxuXHRzZXQgbG9va0RpcmVjdGlvbih2YWwpe1xyXG5cdFx0dGhpcy5fbG9va0RpcmVjdGlvbi5jb3B5KHZhbCk7XHJcblx0XHR0aGlzLnJlY29tcHV0ZVZpZXdwb3J0KCk7XHJcblx0fVxyXG5cclxuXHRyZWdpc3Rlckhvb2tzKHJlbmRlcmVyKVxyXG5cdHtcclxuXHRcdHZhciBzZWxmID0gdGhpcztcclxuXHRcdHNlbGYucmVuZGVyZXIgPSByZW5kZXJlcjtcclxuXHJcblx0XHQvLyBzZXQgc3R5bGVzIG9uIHRoZSBwYWdlLCBzbyB0aGUgcHJldmlldyB3b3JrcyByaWdodFxyXG5cdFx0ZG9jdW1lbnQuYm9keS5wYXJlbnRFbGVtZW50LnN0eWxlLmhlaWdodCA9ICcxMDAlJztcclxuXHRcdGRvY3VtZW50LmJvZHkuc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xyXG5cdFx0ZG9jdW1lbnQuYm9keS5zdHlsZS5tYXJnaW4gPSAnMCc7XHJcblx0XHRkb2N1bWVudC5ib2R5LnN0eWxlLm92ZXJmbG93ID0gJ2hpZGRlbic7XHJcblxyXG5cdFx0dmFyIGluZm8gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdwJyk7XHJcblx0XHRpbmZvLmlubmVySFRNTCA9IFsnTWlkZGxlIGNsaWNrIGFuZCBkcmFnIHRvIHBhbicsICdNb3VzZSB3aGVlbCB0byB6b29tJywgJ0Fycm93IGtleXMgdG8gcm90YXRlJ10uam9pbignPGJyLz4nKTtcclxuXHRcdE9iamVjdC5hc3NpZ24oaW5mby5zdHlsZSwge1xyXG5cdFx0XHRwb3NpdGlvbjogJ2ZpeGVkJyxcclxuXHRcdFx0dG9wOiAnMTBweCcsXHJcblx0XHRcdGxlZnQ6ICcxMHB4JyxcclxuXHRcdFx0bWFyZ2luOiAwXHJcblx0XHR9KTtcclxuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoaW5mbyk7XHJcblxyXG5cdFx0Ly8gcmVzaXplIHRoZSBwcmV2aWV3IGNhbnZhcyB3aGVuIHdpbmRvdyByZXNpemVzXHJcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigncmVzaXplJywgZSA9PiBzZWxmLnJlY29tcHV0ZVZpZXdwb3J0KCkpO1xyXG5cdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xyXG5cclxuXHRcdC8vIG1pZGRsZSBjbGljayBhbmQgZHJhZyB0byBwYW4gdmlld1xyXG5cdFx0dmFyIGRyYWdTdGFydCA9IG51bGwsIGZvY3VzU3RhcnQgPSBudWxsO1xyXG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIGUgPT4ge1xyXG5cdFx0XHRpZihlLmJ1dHRvbiA9PT0gMSl7XHJcblx0XHRcdFx0ZHJhZ1N0YXJ0ID0ge3g6IGUuY2xpZW50WCwgeTogZS5jbGllbnRZfTtcclxuXHRcdFx0XHRmb2N1c1N0YXJ0ID0gc2VsZi5fZm9jdXMuY2xvbmUoKTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIGUgPT4ge1xyXG5cdFx0XHRpZihlLmJ1dHRvbiA9PT0gMSl7XHJcblx0XHRcdFx0ZHJhZ1N0YXJ0ID0gbnVsbDtcclxuXHRcdFx0XHRmb2N1c1N0YXJ0ID0gbnVsbDtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblx0XHR3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgZSA9PiB7XHJcblx0XHRcdGlmKGRyYWdTdGFydClcclxuXHRcdFx0e1xyXG5cdFx0XHRcdGxldCB7Y2xpZW50V2lkdGg6IHcsIGNsaWVudEhlaWdodDogaH0gPSBkb2N1bWVudC5ib2R5O1xyXG5cdFx0XHRcdGxldCBwaXhlbHNQZXJNZXRlciA9IE1hdGguc3FydCh3KncraCpoKSAvIHNlbGYuX3ZpZXdTaXplO1xyXG5cdFx0XHRcdGxldCBkeCA9IGUuY2xpZW50WCAtIGRyYWdTdGFydC54LCBkeSA9IGUuY2xpZW50WSAtIGRyYWdTdGFydC55O1xyXG5cdFx0XHRcdGxldCByaWdodCA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuY3Jvc3NWZWN0b3JzKHNlbGYuX2xvb2tEaXJlY3Rpb24sIHNlbGYudXApO1xyXG5cclxuXHRcdFx0XHRzZWxmLl9mb2N1cy5jb3B5KGZvY3VzU3RhcnQpXHJcblx0XHRcdFx0XHQuYWRkKHNlbGYudXAuY2xvbmUoKS5tdWx0aXBseVNjYWxhcihkeS9waXhlbHNQZXJNZXRlcikpXHJcblx0XHRcdFx0XHQuYWRkKHJpZ2h0Lm11bHRpcGx5U2NhbGFyKC1keC9waXhlbHNQZXJNZXRlcikpO1xyXG5cclxuXHRcdFx0XHRzZWxmLnJlY29tcHV0ZVZpZXdwb3J0KCk7XHJcblx0XHRcdH1cclxuXHRcdH0pO1xyXG5cclxuXHRcdC8vIHdoZWVsIHRvIHpvb21cclxuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCd3aGVlbCcsIGUgPT4ge1xyXG5cdFx0XHRpZihlLmRlbHRhWSA8IDApe1xyXG5cdFx0XHRcdHNlbGYuX3ZpZXdTaXplICo9IDAuOTA7XHJcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xyXG5cdFx0XHR9XHJcblx0XHRcdGVsc2UgaWYoZS5kZWx0YVkgPiAwKXtcclxuXHRcdFx0XHRzZWxmLl92aWV3U2l6ZSAqPSAxLjE7XHJcblx0XHRcdFx0c2VsZi5yZWNvbXB1dGVWaWV3cG9ydCgpO1xyXG5cdFx0XHR9XHJcblx0XHR9KTtcclxuXHJcblx0XHQvLyBhcnJvdyBrZXlzIHRvIHJvdGF0ZVxyXG5cdFx0d2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBlID0+IHtcclxuXHRcdFx0aWYoZS5rZXkgPT09ICdBcnJvd0Rvd24nKXtcclxuXHRcdFx0XHRsZXQgcmlnaHQgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmNyb3NzVmVjdG9ycyhzZWxmLl9sb29rRGlyZWN0aW9uLCBzZWxmLnVwKTtcclxuXHRcdFx0XHRzZWxmLl9sb29rRGlyZWN0aW9uLmFwcGx5QXhpc0FuZ2xlKHJpZ2h0LCBNYXRoLlBJLzIpO1xyXG5cdFx0XHRcdC8vc2VsZi5ncmlkSGVscGVyLnJvdGF0ZU9uQXhpcyhyaWdodCwgTWF0aC5QSS8yKTtcclxuXHRcdFx0XHRzZWxmLnJlY29tcHV0ZVZpZXdwb3J0KCk7XHJcblx0XHRcdH1cclxuXHRcdFx0ZWxzZSBpZihlLmtleSA9PT0gJ0Fycm93VXAnKXtcclxuXHRcdFx0XHRsZXQgcmlnaHQgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmNyb3NzVmVjdG9ycyhzZWxmLl9sb29rRGlyZWN0aW9uLCBzZWxmLnVwKTtcclxuXHRcdFx0XHRzZWxmLl9sb29rRGlyZWN0aW9uLmFwcGx5QXhpc0FuZ2xlKHJpZ2h0LCAtTWF0aC5QSS8yKTtcclxuXHRcdFx0XHQvL3NlbGYuZ3JpZEhlbHBlci5yb3RhdGVPbkF4aXMocmlnaHQsIC1NYXRoLlBJLzIpO1xyXG5cdFx0XHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcclxuXHJcblx0XHRcdH1cclxuXHRcdFx0ZWxzZSBpZihlLmtleSA9PT0gJ0Fycm93TGVmdCcpe1xyXG5cdFx0XHRcdHNlbGYuX2xvb2tEaXJlY3Rpb24uYXBwbHlBeGlzQW5nbGUoc2VsZi51cCwgLU1hdGguUEkvMik7XHJcblx0XHRcdFx0Ly9zZWxmLmdyaWRIZWxwZXIucm90YXRlT25BeGlzKHNlbGYudXAsIC1NYXRoLlBJLzIpO1xyXG5cdFx0XHRcdHNlbGYucmVjb21wdXRlVmlld3BvcnQoKTtcclxuXHRcdFx0fVxyXG5cdFx0XHRlbHNlIGlmKGUua2V5ID09PSAnQXJyb3dSaWdodCcpe1xyXG5cdFx0XHRcdHNlbGYuX2xvb2tEaXJlY3Rpb24uYXBwbHlBeGlzQW5nbGUoc2VsZi51cCwgTWF0aC5QSS8yKTtcclxuXHRcdFx0XHQvL3NlbGYuZ3JpZEhlbHBlci5yb3RhdGVPbkF4aXMoc2VsZi51cCwgTWF0aC5QSS8yKTtcclxuXHRcdFx0XHRzZWxmLnJlY29tcHV0ZVZpZXdwb3J0KCk7XHJcblx0XHRcdH1cclxuXHRcdH0pO1xyXG5cdH1cclxuXHJcblx0cmVjb21wdXRlVmlld3BvcnQoKVxyXG5cdHtcclxuXHRcdHZhciB7Y2xpZW50V2lkdGg6IHcsIGNsaWVudEhlaWdodDogaH0gPSBkb2N1bWVudC5ib2R5O1xyXG5cclxuXHRcdC8vIHJlc2l6ZSBjYW52YXNcclxuXHRcdHRoaXMucmVuZGVyZXIuc2V0U2l6ZSh3LCBoKTtcclxuXHJcblx0XHQvLyBjb21wdXRlIHdpbmRvdyBkaW1lbnNpb25zIGZyb20gdmlldyBzaXplXHJcblx0XHR2YXIgcmF0aW8gPSB3L2g7XHJcblx0XHR2YXIgaGVpZ2h0ID0gTWF0aC5zcXJ0KCAodGhpcy5fdmlld1NpemUqdGhpcy5fdmlld1NpemUpIC8gKHJhdGlvKnJhdGlvICsgMSkgKTtcclxuXHRcdHZhciB3aWR0aCA9IHJhdGlvICogaGVpZ2h0O1xyXG5cclxuXHRcdC8vIHNldCBmcnVzdHJ1bSBlZGdlc1xyXG5cdFx0dGhpcy5sZWZ0ID0gLXdpZHRoLzI7XHJcblx0XHR0aGlzLnJpZ2h0ID0gd2lkdGgvMjtcclxuXHRcdHRoaXMudG9wID0gaGVpZ2h0LzI7XHJcblx0XHR0aGlzLmJvdHRvbSA9IC1oZWlnaHQvMjtcclxuXHJcblx0XHR0aGlzLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcclxuXHJcblx0XHQvLyB1cGRhdGUgcG9zaXRpb25cclxuXHRcdHRoaXMucG9zaXRpb24uY29weSh0aGlzLl9mb2N1cykuc3ViKCB0aGlzLl9sb29rRGlyZWN0aW9uLmNsb25lKCkubXVsdGlwbHlTY2FsYXIoMjAwKSApO1xyXG5cdFx0aWYoIE1hdGguYWJzKCB0aGlzLl9sb29rRGlyZWN0aW9uLm5vcm1hbGl6ZSgpLmRvdChuZXcgVEhSRUUuVmVjdG9yMygwLC0xLDApKSApID09PSAxIClcclxuXHRcdFx0dGhpcy51cC5zZXQoMCwwLDEpOyAvLyBpZiB3ZSdyZSBsb29raW5nIGRvd24gdGhlIFkgYXhpc1xyXG5cdFx0ZWxzZVxyXG5cdFx0XHR0aGlzLnVwLnNldCgwLDEsMCk7XHJcblx0XHR0aGlzLmxvb2tBdCggdGhpcy5fZm9jdXMgKTtcclxuXHJcblx0XHR3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2Rpb3JhbWFWaWV3U2V0dGluZ3MnLCBKU09OLnN0cmluZ2lmeSh7XHJcblx0XHRcdGZvY3VzOiB0aGlzLl9mb2N1cy50b0FycmF5KCksXHJcblx0XHRcdHZpZXdTaXplOiB0aGlzLl92aWV3U2l6ZSxcclxuXHRcdFx0bG9va0RpcmVjdGlvbjogdGhpcy5fbG9va0RpcmVjdGlvbi50b0FycmF5KClcclxuXHRcdH0pKTtcclxuXHR9XHJcbn1cclxuIiwiJ3VzZSBzdHJpY3QnO1xyXG5cclxuaW1wb3J0ICogYXMgTG9hZGVycyBmcm9tICcuL2xvYWRlcnMnO1xyXG5pbXBvcnQgUHJldmlld0NhbWVyYSBmcm9tICcuL2NhbWVyYSc7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBEaW9yYW1hXHJcbntcclxuXHRjb25zdHJ1Y3Rvcih7YmdDb2xvcj0weGFhYWFhYSwgZ3JpZE9mZnNldD1bMCwwLDBdLCBmdWxsc3BhY2U9ZmFsc2V9ID0ge30pXHJcblx0e1xyXG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xyXG5cdFx0c2VsZi5fY2FjaGUgPSBMb2FkZXJzLl9jYWNoZTtcclxuXHRcdHNlbGYuc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKTtcclxuXHJcblx0XHQvLyBzZXQgdXAgcmVuZGVyZXIgYW5kIHNjYWxlXHJcblx0XHRpZihhbHRzcGFjZS5pbkNsaWVudClcclxuXHRcdHtcclxuXHRcdFx0c2VsZi5yZW5kZXJlciA9IGFsdHNwYWNlLmdldFRocmVlSlNSZW5kZXJlcigpO1xyXG5cdFx0XHRzZWxmLl9lbnZQcm9taXNlID0gUHJvbWlzZS5hbGwoW2FsdHNwYWNlLmdldEVuY2xvc3VyZSgpLCBhbHRzcGFjZS5nZXRTcGFjZSgpXSlcclxuXHRcdFx0LnRoZW4oKFtlLCBzXSkgPT4ge1xyXG5cclxuXHRcdFx0XHRmdW5jdGlvbiBhZGp1c3RTY2FsZSgpe1xyXG5cdFx0XHRcdFx0c2VsZi5zY2VuZS5zY2FsZS5zZXRTY2FsYXIoZS5waXhlbHNQZXJNZXRlcik7XHJcblx0XHRcdFx0XHRzZWxmLmVudiA9IE9iamVjdC5hc3NpZ24oe30sIGUsIHMpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHRhZGp1c3RTY2FsZSgpO1xyXG5cclxuXHRcdFx0XHRpZihmdWxsc3BhY2Upe1xyXG5cdFx0XHRcdFx0c2VsZi5fZnNQcm9taXNlID0gZS5yZXF1ZXN0RnVsbHNwYWNlKCkuY2F0Y2goKGUpID0+IGNvbnNvbGUud2FybignUmVxdWVzdCBmb3IgZnVsbHNwYWNlIGRlbmllZCcpKTtcclxuXHRcdFx0XHRcdGUuYWRkRXZlbnRMaXN0ZW5lcignZnVsbHNwYWNlY2hhbmdlJywgYWRqdXN0U2NhbGUpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHRlbHNlXHJcblx0XHRcdFx0XHRzZWxmLl9mc1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcclxuXHRcdFx0fSk7XHJcblx0XHR9XHJcblx0XHRlbHNlXHJcblx0XHR7XHJcblx0XHRcdC8vIHNldCB1cCBwcmV2aWV3IHJlbmRlcmVyLCBpbiBjYXNlIHdlJ3JlIG91dCBvZiB3b3JsZFxyXG5cdFx0XHRzZWxmLnJlbmRlcmVyID0gbmV3IFRIUkVFLldlYkdMUmVuZGVyZXIoKTtcclxuXHRcdFx0c2VsZi5yZW5kZXJlci5zZXRTaXplKGRvY3VtZW50LmJvZHkuY2xpZW50V2lkdGgsIGRvY3VtZW50LmJvZHkuY2xpZW50SGVpZ2h0KTtcclxuXHRcdFx0c2VsZi5yZW5kZXJlci5zZXRDbGVhckNvbG9yKCBiZ0NvbG9yICk7XHJcblx0XHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoc2VsZi5yZW5kZXJlci5kb21FbGVtZW50KTtcclxuXHJcblx0XHRcdHNlbGYucHJldmlld0NhbWVyYSA9IG5ldyBQcmV2aWV3Q2FtZXJhKCk7XHJcblx0XHRcdHNlbGYucHJldmlld0NhbWVyYS5ncmlkSGVscGVyLnBvc2l0aW9uLmZyb21BcnJheShncmlkT2Zmc2V0KTtcclxuXHRcdFx0c2VsZi5zY2VuZS5hZGQoc2VsZi5wcmV2aWV3Q2FtZXJhLCBzZWxmLnByZXZpZXdDYW1lcmEuZ3JpZEhlbHBlcik7XHJcblx0XHRcdHNlbGYucHJldmlld0NhbWVyYS5yZWdpc3Rlckhvb2tzKHNlbGYucmVuZGVyZXIpO1xyXG5cclxuXHRcdFx0Ly8gc2V0IHVwIGN1cnNvciBlbXVsYXRpb25cclxuXHRcdFx0YWx0c3BhY2UudXRpbGl0aWVzLnNoaW1zLmN1cnNvci5pbml0KHNlbGYuc2NlbmUsIHNlbGYucHJldmlld0NhbWVyYSwge3JlbmRlcmVyOiBzZWxmLnJlbmRlcmVyfSk7XHJcblxyXG5cdFx0XHQvLyBzdHViIGVudmlyb25tZW50XHJcblx0XHRcdHNlbGYuZW52ID0ge1xyXG5cdFx0XHRcdGlubmVyV2lkdGg6IDEwMjQsXHJcblx0XHRcdFx0aW5uZXJIZWlnaHQ6IDEwMjQsXHJcblx0XHRcdFx0aW5uZXJEZXB0aDogMTAyNCxcclxuXHRcdFx0XHRwaXhlbHNQZXJNZXRlcjogZnVsbHNwYWNlID8gMSA6IDEwMjQvMyxcclxuXHRcdFx0XHRzaWQ6ICdicm93c2VyJyxcclxuXHRcdFx0XHRuYW1lOiAnYnJvd3NlcicsXHJcblx0XHRcdFx0dGVtcGxhdGVTaWQ6ICdicm93c2VyJ1xyXG5cdFx0XHR9O1xyXG5cclxuXHRcdFx0c2VsZi5fZW52UHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xyXG5cdFx0XHRzZWxmLl9mc1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG5cclxuXHRzdGFydCguLi5tb2R1bGVzKVxyXG5cdHtcclxuXHRcdHZhciBzZWxmID0gdGhpcztcclxuXHJcblx0XHQvLyBkZXRlcm1pbmUgd2hpY2ggYXNzZXRzIGFyZW4ndCBzaGFyZWRcclxuXHRcdHZhciBzaW5nbGV0b25zID0ge307XHJcblx0XHRtb2R1bGVzLmZvckVhY2gobW9kID0+XHJcblx0XHR7XHJcblx0XHRcdGZ1bmN0aW9uIGNoZWNrQXNzZXQodXJsKXtcclxuXHRcdFx0XHRpZihzaW5nbGV0b25zW3VybF0gPT09IHVuZGVmaW5lZCkgc2luZ2xldG9uc1t1cmxdID0gdHJ1ZTtcclxuXHRcdFx0XHRlbHNlIGlmKHNpbmdsZXRvbnNbdXJsXSA9PT0gdHJ1ZSkgc2luZ2xldG9uc1t1cmxdID0gZmFsc2U7XHJcblx0XHRcdH1cclxuXHRcdFx0T2JqZWN0LmtleXMobW9kLmFzc2V0cy50ZXh0dXJlcyB8fCB7fSkubWFwKGsgPT4gbW9kLmFzc2V0cy50ZXh0dXJlc1trXSkuZm9yRWFjaChjaGVja0Fzc2V0KTtcclxuXHRcdFx0T2JqZWN0LmtleXMobW9kLmFzc2V0cy5tb2RlbHMgfHwge30pLm1hcChrID0+IG1vZC5hc3NldHMubW9kZWxzW2tdKS5mb3JFYWNoKGNoZWNrQXNzZXQpO1xyXG5cdFx0XHRPYmplY3Qua2V5cyhtb2QuYXNzZXRzLnBvc3RlcnMgfHwge30pLm1hcChrID0+IG1vZC5hc3NldHMucG9zdGVyc1trXSkuZm9yRWFjaChjaGVja0Fzc2V0KTtcclxuXHRcdH0pO1xyXG5cclxuXHRcdC8vIGRldGVybWluZSBpZiB0aGUgdHJhY2tpbmcgc2tlbGV0b24gaXMgbmVlZGVkXHJcblx0XHRsZXQgbmVlZHNTa2VsZXRvbiA9IG1vZHVsZXMucmVkdWNlKChucyxtKSA9PiBucyB8fCBtLm5lZWRzU2tlbGV0b24sIGZhbHNlKTtcclxuXHRcdGlmKG5lZWRzU2tlbGV0b24gJiYgYWx0c3BhY2UuaW5DbGllbnQpe1xyXG5cdFx0XHRzZWxmLl9za2VsUHJvbWlzZSA9IGFsdHNwYWNlLmdldFRocmVlSlNUcmFja2luZ1NrZWxldG9uKCkudGhlbihza2VsID0+IHtcclxuXHRcdFx0XHRzZWxmLnNjZW5lLmFkZChza2VsKTtcclxuXHRcdFx0XHRzZWxmLmVudi5za2VsID0gc2tlbDtcclxuXHRcdFx0XHRzZWxmLmVudiA9IE9iamVjdC5mcmVlemUoc2VsZi5lbnYpO1xyXG5cdFx0XHR9KTtcclxuXHRcdH1cclxuXHRcdGVsc2Uge1xyXG5cdFx0XHRzZWxmLmVudiA9IE9iamVjdC5mcmVlemUoc2VsZi5lbnYpO1xyXG5cdFx0XHRzZWxmLl9za2VsUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xyXG5cdFx0fVxyXG5cclxuXHRcdFByb21pc2UuYWxsKFtzZWxmLl9lbnZQcm9taXNlLCBzZWxmLl9mc1Byb21pc2UsIHNlbGYuX3NrZWxQcm9taXNlXSkudGhlbigoKSA9PlxyXG5cdFx0e1xyXG5cdFx0XHQvLyBjb25zdHJ1Y3QgZGlvcmFtYXNcclxuXHRcdFx0bW9kdWxlcy5mb3JFYWNoKGZ1bmN0aW9uKG1vZHVsZSlcclxuXHRcdFx0e1xyXG5cdFx0XHRcdGxldCByb290ID0gbnVsbDtcclxuXHJcblx0XHRcdFx0aWYobW9kdWxlIGluc3RhbmNlb2YgVEhSRUUuT2JqZWN0M0Qpe1xyXG5cdFx0XHRcdFx0cm9vdCA9IG1vZHVsZTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0ZWxzZVxyXG5cdFx0XHRcdHtcclxuXHRcdFx0XHRcdHJvb3QgPSBuZXcgVEhSRUUuT2JqZWN0M0QoKTtcclxuXHJcblx0XHRcdFx0XHQvLyBoYW5kbGUgYWJzb2x1dGUgcG9zaXRpb25pbmdcclxuXHRcdFx0XHRcdGlmKG1vZHVsZS50cmFuc2Zvcm0pe1xyXG5cdFx0XHRcdFx0XHRyb290Lm1hdHJpeC5mcm9tQXJyYXkobW9kdWxlLnRyYW5zZm9ybSk7XHJcblx0XHRcdFx0XHRcdHJvb3QubWF0cml4LmRlY29tcG9zZShyb290LnBvc2l0aW9uLCByb290LnF1YXRlcm5pb24sIHJvb3Quc2NhbGUpO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0XHRcdGlmKG1vZHVsZS5wb3NpdGlvbil7XHJcblx0XHRcdFx0XHRcdFx0cm9vdC5wb3NpdGlvbi5mcm9tQXJyYXkobW9kdWxlLnBvc2l0aW9uKTtcclxuXHRcdFx0XHRcdFx0fVxyXG5cdFx0XHRcdFx0XHRpZihtb2R1bGUucm90YXRpb24pe1xyXG5cdFx0XHRcdFx0XHRcdHJvb3Qucm90YXRpb24uZnJvbUFycmF5KG1vZHVsZS5yb3RhdGlvbik7XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdC8vIGhhbmRsZSByZWxhdGl2ZSBwb3NpdGlvbmluZ1xyXG5cdFx0XHRcdGlmKG1vZHVsZS52ZXJ0aWNhbEFsaWduKXtcclxuXHRcdFx0XHRcdGxldCBoYWxmSGVpZ2h0ID0gc2VsZi5lbnYuaW5uZXJIZWlnaHQvKDIqc2VsZi5lbnYucGl4ZWxzUGVyTWV0ZXIpO1xyXG5cdFx0XHRcdFx0c3dpdGNoKG1vZHVsZS52ZXJ0aWNhbEFsaWduKXtcclxuXHRcdFx0XHRcdGNhc2UgJ3RvcCc6XHJcblx0XHRcdFx0XHRcdHJvb3QudHJhbnNsYXRlWShoYWxmSGVpZ2h0KTtcclxuXHRcdFx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdFx0XHRjYXNlICdib3R0b20nOlxyXG5cdFx0XHRcdFx0XHRyb290LnRyYW5zbGF0ZVkoLWhhbGZIZWlnaHQpO1xyXG5cdFx0XHRcdFx0XHRicmVhaztcclxuXHRcdFx0XHRcdGNhc2UgJ21pZGRsZSc6XHJcblx0XHRcdFx0XHRcdC8vIGRlZmF1bHRcclxuXHRcdFx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdFx0XHRkZWZhdWx0OlxyXG5cdFx0XHRcdFx0XHRjb25zb2xlLndhcm4oJ0ludmFsaWQgdmFsdWUgZm9yIFwidmVydGljYWxBbGlnblwiIC0gJywgbW9kdWxlLnZlcnRpY2FsQWxpZ24pO1xyXG5cdFx0XHRcdFx0XHRicmVhaztcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdHNlbGYuc2NlbmUuYWRkKHJvb3QpO1xyXG5cclxuXHRcdFx0XHRpZihzZWxmLnByZXZpZXdDYW1lcmEpe1xyXG5cdFx0XHRcdFx0bGV0IGF4aXMgPSBuZXcgVEhSRUUuQXhpc0hlbHBlcigxKTtcclxuXHRcdFx0XHRcdGF4aXMudXNlckRhdGEuYWx0c3BhY2UgPSB7Y29sbGlkZXI6IHtlbmFibGVkOiBmYWxzZX19O1xyXG5cdFx0XHRcdFx0cm9vdC5hZGQoYXhpcyk7XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHRzZWxmLmxvYWRBc3NldHMobW9kdWxlLmFzc2V0cywgc2luZ2xldG9ucykudGhlbigocmVzdWx0cykgPT4ge1xyXG5cdFx0XHRcdFx0bW9kdWxlLmluaXRpYWxpemUoc2VsZi5lbnYsIHJvb3QsIHJlc3VsdHMpO1xyXG5cdFx0XHRcdH0pO1xyXG5cdFx0XHR9KTtcclxuXHRcdH0pO1xyXG5cclxuXHRcdC8vIHN0YXJ0IGFuaW1hdGluZ1xyXG5cdFx0d2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZShmdW5jdGlvbiBhbmltYXRlKHRpbWVzdGFtcClcclxuXHRcdHtcclxuXHRcdFx0d2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZShhbmltYXRlKTtcclxuXHRcdFx0c2VsZi5zY2VuZS51cGRhdGVBbGxCZWhhdmlvcnMoKTtcclxuXHRcdFx0aWYod2luZG93LlRXRUVOKSBUV0VFTi51cGRhdGUoKTtcclxuXHRcdFx0c2VsZi5yZW5kZXJlci5yZW5kZXIoc2VsZi5zY2VuZSwgc2VsZi5wcmV2aWV3Q2FtZXJhKTtcclxuXHRcdH0pO1xyXG5cdH1cclxuXHJcblx0bG9hZEFzc2V0cyhtYW5pZmVzdCwgc2luZ2xldG9ucylcclxuXHR7XHJcblx0XHR2YXIgc2VsZiA9IHRoaXM7XHJcblxyXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XHJcblx0XHR7XHJcblx0XHRcdC8vIHBvcHVsYXRlIGNhY2hlXHJcblx0XHRcdFByb21pc2UuYWxsKFtcclxuXHJcblx0XHRcdFx0Ly8gcG9wdWxhdGUgbW9kZWwgY2FjaGVcclxuXHRcdFx0XHQuLi5PYmplY3Qua2V5cyhtYW5pZmVzdC5tb2RlbHMgfHwge30pLm1hcChpZCA9PiBMb2FkZXJzLk1vZGVsUHJvbWlzZShtYW5pZmVzdC5tb2RlbHNbaWRdKSksXHJcblxyXG5cdFx0XHRcdC8vIHBvcHVsYXRlIGV4cGxpY2l0IHRleHR1cmUgY2FjaGVcclxuXHRcdFx0XHQuLi5PYmplY3Qua2V5cyhtYW5pZmVzdC50ZXh0dXJlcyB8fCB7fSkubWFwKGlkID0+IExvYWRlcnMuVGV4dHVyZVByb21pc2UobWFuaWZlc3QudGV4dHVyZXNbaWRdKSksXHJcblxyXG5cdFx0XHRcdC8vIGdlbmVyYXRlIGFsbCBwb3N0ZXJzXHJcblx0XHRcdFx0Li4uT2JqZWN0LmtleXMobWFuaWZlc3QucG9zdGVycyB8fCB7fSkubWFwKGlkID0+IExvYWRlcnMuUG9zdGVyUHJvbWlzZShtYW5pZmVzdC5wb3N0ZXJzW2lkXSkpXHJcblx0XHRcdF0pXHJcblxyXG5cdFx0XHQudGhlbigoKSA9PlxyXG5cdFx0XHR7XHJcblx0XHRcdFx0Ly8gcG9wdWxhdGUgcGF5bG9hZCBmcm9tIGNhY2hlXHJcblx0XHRcdFx0dmFyIHBheWxvYWQgPSB7bW9kZWxzOiB7fSwgdGV4dHVyZXM6IHt9LCBwb3N0ZXJzOiB7fX07XHJcblxyXG5cdFx0XHRcdGZvcihsZXQgaSBpbiBtYW5pZmVzdC5tb2RlbHMpe1xyXG5cdFx0XHRcdFx0bGV0IHVybCA9IG1hbmlmZXN0Lm1vZGVsc1tpXTtcclxuXHRcdFx0XHRcdGxldCB0ID0gTG9hZGVycy5fY2FjaGUubW9kZWxzW3VybF07XHJcblx0XHRcdFx0XHRwYXlsb2FkLm1vZGVsc1tpXSA9IHQgPyBzaW5nbGV0b25zW3VybF0gPyB0IDogdC5jbG9uZSgpIDogbnVsbDtcclxuXHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdGZvcihsZXQgaSBpbiBtYW5pZmVzdC50ZXh0dXJlcyl7XHJcblx0XHRcdFx0XHRsZXQgdXJsID0gbWFuaWZlc3QudGV4dHVyZXNbaV07XHJcblx0XHRcdFx0XHRsZXQgdCA9IExvYWRlcnMuX2NhY2hlLnRleHR1cmVzW3VybF07XHJcblx0XHRcdFx0XHRwYXlsb2FkLnRleHR1cmVzW2ldID0gdCA/IHNpbmdsZXRvbnNbdXJsXSA/IHQgOiB0LmNsb25lKCkgOiBudWxsO1xyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0Zm9yKGxldCBpIGluIG1hbmlmZXN0LnBvc3RlcnMpe1xyXG5cdFx0XHRcdFx0bGV0IHVybCA9IG1hbmlmZXN0LnBvc3RlcnNbaV07XHJcblx0XHRcdFx0XHRsZXQgdCA9IExvYWRlcnMuX2NhY2hlLnBvc3RlcnNbdXJsXTtcclxuXHRcdFx0XHRcdHBheWxvYWQucG9zdGVyc1tpXSA9IHQgPyBzaW5nbGV0b25zW3VybF0gPyB0IDogdC5jbG9uZSgpIDogbnVsbDtcclxuXHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdHJlc29sdmUocGF5bG9hZCk7XHJcblx0XHRcdH0pXHJcblx0XHRcdC5jYXRjaChlID0+IGNvbnNvbGUuZXJyb3IoZS5zdGFjaykpO1xyXG5cdFx0fSk7XHJcblx0fVxyXG5cclxufTtcclxuIl0sIm5hbWVzIjpbImxldCIsImxvYWRlciIsInN1cGVyIiwicmlnaHQiLCJMb2FkZXJzLl9jYWNoZSIsIkxvYWRlcnMuTW9kZWxQcm9taXNlIiwiTG9hZGVycy5UZXh0dXJlUHJvbWlzZSIsIkxvYWRlcnMuUG9zdGVyUHJvbWlzZSIsImkiLCJ1cmwiLCJ0Il0sIm1hcHBpbmdzIjoiOzs7QUFFQUEsSUFBSSxLQUFLLEdBQUcsQ0FBQyxNQUFNLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDOztBQUVwRCxTQUFTLFlBQVksQ0FBQyxHQUFHO0FBQ3pCO0NBQ0MsT0FBTyxJQUFJLE9BQU8sQ0FBQyxVQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUU7RUFFcEMsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0dBQ3BCLE9BQU8sT0FBTyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztHQUNsQzs7O09BR0ksR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0dBQzVCLEdBQUcsS0FBSyxDQUFDLFVB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QUssSUFBSSxFQUFFLEVBQUEsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEtBQUssQ0FBQyxFQUFBO0dBQzFEO0VBQ0YsTUFBTyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLFFBQVEsSUFBSSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsVUFBQSxDQUFDLEVBQUMsU0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBQSxDQUFDLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0VBQzdGLE1BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLElBQUksRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLFVBQUEsQ0FBQyxFQUFDLFNBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztFQUN6RixNQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsT0FBTyxJQUFJLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxVQUFBLENBQUMsRUFBQyxTQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFBLENBQUMsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7RUFDMUYsQ0FBQyxDQUFDOzs7Q0FHSixJQUFLLGFBQWEsR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLFVBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxTQUFHLEVBQUUsSUFBSSxDQUFDLENBQUMsYUFBYSxHQUFBLEVBQUUsS0FBSyxDQUFDLENBQUM7Q0FDNUUsR0FBSSxhQUFhLElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQztFQUN0QyxJQUFLLENBQUMsWUFBWSxHQUFHLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFBLElBQUksRUFBQztHQUNwRSxJQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJ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
