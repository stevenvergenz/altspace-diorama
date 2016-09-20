'use strict';

Diorama.PreviewCamera = class PreviewCamera extends THREE.OrthographicCamera
{
	constructor(focus = new THREE.Vector3(), viewSize = 20, lookDirection = new THREE.Vector3(0,-1,0))
	{
		super(-1, 1, 1, -1, .1, 400);

		this.viewSize = viewSize;
		this.focus = focus;
		this.lookDirection = lookDirection;
	}

	registerHooks(renderer)
	{
		this.renderer = renderer;
		document.body.style.margin = '0';

		this.resizeViewport();
	}

	resizeViewport()
	{
		// resize canvas
		this.renderer.setSize(window.innerWidth, window.innerHeight);

		// compute window dimensions from view size
		var ratio = window.innerWidth / window.innerHeight;
		var height = Math.sqrt( (this.viewSize*this.viewSize) / (ratio*ratio + 1) );
		var width = ratio * height;

		// set frustrum edges
		this.left = -width/2;
		this.right = width/2;
		this.top = height/2;
		this.bottom = -height/2;

		this.updateProjectionMatrix();

		// update position
		this.position.copy(this.focus).sub( this.lookDirection.clone().multiplyScalar(200) );
		this.lookAt( this.focus );
	}
}
