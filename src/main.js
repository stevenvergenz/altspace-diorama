'use strict';

(function(Diorama)
{
	var renderer, camera, env;
	var scene = new THREE.Scene();

	Diorama.load = function(...modules)
	{
		// set up renderer and scale
		if(altspace.inClient)
		{
			renderer = altspace.getThreeJSRenderer();
			Promise.all([altspace.getEnclosure(), altspace.getSpace()])
			.then(function([e, s]){
				env = Object.freeze({
					innerHeight: e.innerHeight,
					innerWidth: e.innerWidth,
					innerDepth: e.innerDepth,
					pixelsPerMeter: e.pixelsPerMeter,
					sid: s.sid,
					name: s.name,
					templateSid: s.templateSid
				});

				scene.scale.multiplyScalar(e.pixelsPerMeter);
				start();
			});
		}
		else
		{
			// set up preview renderer, in case we're out of world
			renderer = new THREE.WebGLRenderer();
			renderer.setSize(720, 720);
			renderer.setClearColor( 0x888888 );
			document.body.appendChild(renderer.domElement);
		
			camera = new THREE.PerspectiveCamera(90, 1, 0.01, 10000);
			camera.position.set(0, -10, 20);
			camera.rotation.set(0, Math.PI, 0);
			scene.add(camera);
		
			// set up cursor emulation
			altspace.utilities.shims.cursor.init(scene, camera, {renderer: renderer});
		
			// stub environment
			env = Object.freeze({
				innerWidth: 1024,
				innerHeight: 1024,
				innerDepth: 1024,
				pixelsPerMeter: 1024/3,
				sid: 'browser',
				name: 'browser',
				templateSid: 'browser'
			});
		
			start();
		}
		
		
		function start()
		{
			// construct dioramas
			modules.forEach(function(module)
			{
				var root = new THREE.Object3D();
				scene.add(root);
		
				Diorama.loadAssets(module.assets, function(results)
				{
					module.initialize(env, root, results);
				});
			});
		
			// start animating
			window.requestAnimationFrame(function animate(timestamp)
			{
				window.requestAnimationFrame(animate);
				scene.updateAllBehaviors();
				renderer.render(scene, camera);
			});
		}

	}

})(window.Diorama = window.Diorama || {});
