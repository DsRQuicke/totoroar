function showMsg(msg, type) {
	// https://stackoverflow.com/a/24428100
	// Note: We try to use the `message` property first (in case `msg` was
	// an exception object). Otherwise we just use the message as is.
	let msgStr = msg.message || msg;

	let consoleMsgFn = null;
	if ( type == "error" ) {
		consoleMsgFn = console.error;
		// Also show the error logo.
		// TODO This is probably not the best location for this code.
		document.getElementById("error_wrapper").classList.remove("hidden");
		// And also temporarily hide the load/enter logos.
		document.getElementById("loading_wrapper").classList.add("temp_hidden");
		document.getElementById("enter_wrapper").classList.add("temp_hidden");
	} else if ( type == "warn" ) {
		consoleMsgFn = console.warn;
	} else if ( type == "debug" ) {
		consoleMsgFn = console.debug;
		// TEMP ->
		// Don't show "debug" message in the message panel.
		msgStr = null;
		// TEMP <-
	} else {
		consoleMsgFn = console.log;
		// TEMP ->
		// Don't show "log" messages in the message panel.
		msgStr = null;
		// TEMP <-
	}
	consoleMsgFn(msg);

	if ( msgStr ) {
		const msgPane = document.getElementById("msg_panel");
		msgPane.classList.add("active");
		msgPane.textContent = msgStr;
	}
}

function hideMsg() {
	let msgPane = document.getElementById("msg_panel");
	msgPane.classList.remove("active");

	// Also hide the error logo (in case it was showing).
	document.getElementById("error_wrapper").classList.add("hidden");
	// And if needed show the temporarily hidden load/enter logos again.
	if ( !document.getElementById("logos_container").classList.contains("loading_finished") ) {
		// Only show the "unhide" the loading wrapper in case loading
		// didn't finish yet. Otherwise unhiding it will basically
		// trigger the fade-out effect of it again, which makes it show
		// up again shortly beneath the enter logo.
		document.getElementById("loading_wrapper").classList.remove("temp_hidden");
	}
	document.getElementById("enter_wrapper").classList.remove("temp_hidden");
}


let g_debug = false;

let g_canvas = null;
let g_xrSession = null;
let g_xrRefSpace = null;
let g_renderer = null;
let g_camera = null;
let g_scene = null;
let g_recticle = null;
let g_hud = null;
let g_modelMesh = null;
let g_viewerHitTestSource = null;
let g_raycaster = null;
let g_texMgr = null;
let g_audioMgr = null;
let g_animMgr = null;
let g_actionStateMgr = null;

let g_roarObj = null;
let g_prevHrTime = performance.now();

let g_gltfModelRig = null;
// The model's default height (in [m]).
const g_defModelHeight = 0.3;
// The model's enlarged size (in [m]).
const g_enlargedModelHeight = 2.5;

// Used to store and handle the select's input pose until after the camera is
// also updated with the most recent pose information.
let g_storedSelectData = null;

let g_btnSndsActive = true;


function init() {
	let msgPane = document.getElementById("msg_panel");
	msgPane.addEventListener("click", hideMsg);

	// Show the info panel when #btn_info is clicked.
	document.getElementById("btn_info").addEventListener("click", () => {
		document.getElementById("info_panel_container").classList.add("active");
	});
	// Hide the info panel when it (or its container) is clicked.
	document.getElementById("info_panel_container").addEventListener("click", (evt) => {
		evt.currentTarget.classList.remove("active");
	});

	// Check if WebXR and "immersive-ar" is available. And if so, then start
	// loading the resources.
	if ( !navigator.xr ) {
		showMsg("WebXR not supported", "error");
		return;
	}
	navigator.xr.isSessionSupported("immersive-ar")
	.then((isSupported) => {
		if ( isSupported ) {
			showMsg("immersive-ar supported!");
			// Make the loading and enter logo wrappers visible.
			document.getElementById("loading_wrapper").classList.remove("hidden");
			document.getElementById("enter_wrapper").classList.remove("hidden");

			// Start loading the resources.
			// Note: Since the resources are loaded here before
			// starting the XRSession, we shouldn't dispose of those
			// resources when the XRSession ends. Otherwise the
			// resources won't be available anymore when a new is
			// started again.
			loadResources().then(() => {
				// And once the resources are loaded, show/setup
				// the "Enter AR" button.
				document.getElementById("logos_container").classList.add("loading_finished");
				const btnAR = document.getElementById("btn_enter_ar");
				btnAR.addEventListener("click", setupXRSession);
				btnAR.disabled = false;
			});
		} else {
			showMsg("WebXR immersive-ar sessions not supported.", "error");
		}
	}).catch((err) => {
		showMsg(err, "error");
	});

	// Setup listener and check current state of the button sounds checkbox.
	const btnSndsInput = document.getElementById("btnSounds");
	g_btnSndsActive = btnSndsInput.checked;
	btnSndsInput.addEventListener("change", () => {
		g_btnSndsActive = btnSndsInput.checked;
	});
	// Prevent the info panel from being hidden when clicking on one of the
	// elements on the "bottom_row" of the info panel.
	for ( const el of document.getElementById("bottom_row").children ) {
		el.addEventListener("click", (evt) => {
			// Stop the click event propagation, so the (parent)
			// info panel won't get hidden if this is clicked.
			evt.stopPropagation();
		});
	}

	window.addEventListener("resize", onResize);
}

function loadResources() {
	if ( !g_texMgr ) {
		g_texMgr = new TextureManager();
	}
	if ( !g_audioMgr ) {
		g_audioMgr = new AudioManager();
	}
	return Promise.allSettled([
		g_texMgr.loadTexture("roar", "assets/roar.png"),
		g_texMgr.loadTexture("icon_exit", "assets/icon_exit.png"),
		g_texMgr.loadTexture("icon_move", "assets/icon_move.png"),
		g_texMgr.loadTexture("icon_remove", "assets/icon_remove.png"),
		g_texMgr.loadTexture("icon_scale", "assets/icon_scale.png"),
		g_texMgr.loadTexture("icon_umbrella", "assets/icon_umbrella.png"),
		g_texMgr.loadTexture("icon_whistle", "assets/icon_whistle.png"),
		g_texMgr.loadTexture("recticle", "assets/recticle_1.png"),
		g_texMgr.loadTexture("recticle_alt", "assets/recticle_2.png"),
		// This will assign the `g_gltfModelRig`.
		loadGltfModel("assets/totoro.glb"),
		g_audioMgr.loadAudio("nopoke", "assets/nopoke.ogg"),
		g_audioMgr.loadAudio("poke1", "assets/poke1.ogg"),
		g_audioMgr.loadAudio("poke2", "assets/poke2.ogg"),
		g_audioMgr.loadAudio("sigh", "assets/sigh.ogg"),
		g_audioMgr.loadAudio("flute", "assets/flute.ogg"),
		g_audioMgr.loadAudio("rain", "assets/rain.ogg"),
		g_audioMgr.loadAudio("ohayo", "assets/ohayo.ogg"),
		g_audioMgr.loadAudio("konnichiwa", "assets/konnichiwa.ogg"),
		g_audioMgr.loadAudio("konbanwa", "assets/konbanwa.ogg"),
		g_audioMgr.loadAudio("btn_pos", "assets/btn_pos.ogg"),
		g_audioMgr.loadAudio("btn_neg", "assets/btn_neg.ogg")
	]).then((results) => {
		results.forEach((result) => {
			// Show an error message for any resource that failed to
			// load.
			if ( result.status == "rejected" ) {
				console.error(result.reason);
				// TODO Maybe do a catch on the resource loading
				// promises instead, so we can know which one
				// failed?
				showMsg("Error loading a resource.", "error");
			}
		});
	});
}

function loadGltfModel(filepath) {
	const loader = new THREE.GLTFLoader();
	return new Promise((resolve, reject) => {
		loader.load(filepath, resolve, null, reject);
	}).then((gltfModel) => {
		const root = gltfModel.scene;
		// Rotate the model so it correctly faces forward.
		// TODO Can't we do this in Blender already?
		root.rotation.x = -Math.PI / 2;
		// Use a model rig, so we can later on modify the transform
		// without having to take the actual glTF model's rotation
		// into account.
		g_gltfModelRig = new THREE.Group();
		g_gltfModelRig.add(root);

		// Umbrella
		let bone = root.getObjectByName("HandAPL");
		let subObj = root.getObjectByName("ArmatureUmbrella");
		if ( bone && subObj ) {
			bone.add(subObj);
			// Hide the Umbrella by default.
			subObj.visible = false;
		} else {
			console.error("Failed to attach umbrella to HandAPL.");
		}

		// Nut
		bone = root.getObjectByName("NutAP");
		subObj = root.getObjectByName("Nut");
		if ( bone && subObj ) {
			bone.add(subObj);
		} else {
			console.error("Failed to attach nut to AP.");
		}

		// Setup animation stuff.
		// We add the AnimationMixer and the gltfModel as userData
		// properties, so we can access the animations later on.
		g_gltfModelRig.userData["gltfModel"] = gltfModel;
		g_animMgr = new AnimationManager(root, gltfModel.animations);

		// DEBUG ->
		console.debug("Loaded glTF model", g_gltfModelRig);
		// DEBUG <-
		// Get model size...
		const boxSize = new THREE.Vector3();
		const bbox = new THREE.Box3();
		bbox.setFromObject(root).getSize(boxSize);
		// ... then scale the model so it's about 30cm high, ...
		const scaleFactor = (1 / boxSize.y) * g_defModelHeight;
		// DEBUG >>>
		console.debug(`Model scale factor: ${scaleFactor}, org box height: ${boxSize.y}`);
		// DEBUG <<<
		g_gltfModelRig.scale.setScalar(scaleFactor);
		g_gltfModelRig.userData.isDefaultSize = true;
		// ... and store model's original height in the userData.
		g_gltfModelRig.userData.orgHeight = boxSize.y;

		return g_gltfModelRig;
	});
}

function setupXRSession() {
	if ( !g_xrSession ) {
		// TODO Check if there were any WebXR Hittest API updates.
		// Need to request hit-test upon session request. See example:
		// https://web.dev/ar-hit-test/
		navigator.xr.requestSession("immersive-ar", {
			requiredFeatures: ["local", "hit-test"]
		})
		.then((xrSession) => {
			if ( !xrSession.requestHitTestSource ) {
				showMsg("HitTesting unavailable. Aborting...", "error");
				xrSession.end();
				return;
			}
			g_xrSession = xrSession;
			xrSession.addEventListener("end", onXRSessionEnded);
			// Setup a "select" (~= "click" event) handler.
			xrSession.addEventListener("select", onXRSessionSelect);

			if ( !g_renderer ) {
				// Add the canvas to #container.
				if ( g_canvas == null ) {
					g_canvas = document.createElement("canvas");
					document.getElementById("container").appendChild(g_canvas);
				}
				let context = g_canvas.getContext("webgl2", {
					xrCompatible: true
				});
				let w = window.innerWidth;
				let h = window.innerHeight;
				g_renderer = new THREE.WebGLRenderer({
					"canvas": g_canvas,
					"context": context,
					"preserveDrawingBuffer": true
				});
				// TODO: Do we need this? It was in https://github.com/mrdoob/three.js/blob/master/examples/webxr_ar_paint.html
				// => Not for now, this will increase the
				// render resolution, which is currently high
				// enough when just using the "CSS pixel size".
				// Also see https://threejsfundamentals.org/threejs/lessons/threejs-responsive.html
				// for a better way of taking devicePixelRatio
				// into account.
				//g_renderer.setPixelRatio(window.devicePixelRatio);
				g_renderer.setSize(w, h, false);
				g_renderer.autoClear = false;
				// Setup renderer to use the correct color
				// space. We do this mainly because the glTF
				// model's textures will be using the sRGB
				// encoding.
				// Note: Since we set the output encoding to
				// sRGB, we'll also need to make sure our colors
				// and texutures that we set and load manually
				// need to be converted correctly.
				// https://github.com/mrdoob/three.js/pull/18127
				g_renderer.outputEncoding = THREE.sRGBEncoding;

				g_camera = new THREE.PerspectiveCamera(
					45,	// viewAngle
					w / h,	// aspectRatio
					0.01,	// near
					1000	// far
				);
				// Since we'll be setting the camera's matrices
				// ourselves, we need to disable auto updates.
				// See also: https://threejs.org/docs/index.html#manual/en/introduction/Matrix-transformations
				g_camera.matrixAutoUpdate = false;

				g_scene = new THREE.Scene();

				if ( g_debug ) {
					// Show a gizmo at the origin.
					g_scene.add(new THREE.AxesHelper(0.5));
				}

				if ( g_gltfModelRig ) {
					g_modelMesh = g_gltfModelRig;
				} else {
					console.warn("No glTF model available. Using a simple box as fallback instead.");
					const geometry = new THREE.BoxBufferGeometry(0.1, g_defModelHeight, 0.1);
					// Move the geometry slightly up, so its
					// origin is at the bottom face.
					geometry.translate(0, g_defModelHeight/2, 0);
					const material = new THREE.MeshBasicMaterial({ color: 0xFFFF00 });
					material.color.convertSRGBToLinear();
					g_modelMesh = new THREE.Group();
					g_modelMesh.add(new THREE.Mesh(geometry, material));
					g_modelMesh.userData.orgHeight = g_defModelHeight;
					g_modelMesh.userData.isDefaultSize = true;
				}
				g_modelMesh.visible = false;
				g_scene.add(g_modelMesh);

				// Setup some lighting.
				g_scene.add(new THREE.AmbientLight(0xFFBA76, 0.1));
				const keyLight = new THREE.DirectionalLight(0xFFFFBF, 0.7);
				keyLight.position.x = -10;
				keyLight.position.y = 25;
				keyLight.position.z = 20;
				g_modelMesh.add(keyLight);
				const fillLight = new THREE.DirectionalLight(0xFFE6A0, 0.4);
				fillLight.position.x = 20;
				fillLight.position.y = 20;
				fillLight.position.z = 20;
				g_modelMesh.add(fillLight);
				const backLight = new THREE.DirectionalLight(0xC8B464, 0.25);
				backLight.position.x = -15;
				backLight.position.y = 20;
				backLight.position.z = -20;
				g_modelMesh.add(backLight);

				if ( g_debug ) {
					g_modelMesh.add(new THREE.AxesHelper(2));
				}

				g_roarObj = createRoarObject(0.1, g_texMgr.getTexture("roar"), 2.25, 0.666);
				g_scene.add(g_roarObj);

				g_raycaster = new RaycasterWrapper(g_scene);
				g_raycaster.debug = g_debug;

				// Create an audio listener and attach it to the
				// camera, so that any positional audio that is
				// being played will sound as heared from the
				// camera's (i.e. viewer) position.
				const audioListener = new THREE.AudioListener();
				g_camera.add(audioListener);
				// And also provide the audio listener to the
				// AudioManager.
				g_audioMgr.setListener(audioListener);
			}

			xrSession.updateRenderState({
				baseLayer: new XRWebGLLayer(xrSession, g_renderer.getContext())
			});
			// Note: "local-floor" doesn't seem to yet be supported
			// by AR. Though the WebXR states that if "local" is
			// suppported then "local-floor" must also be supported.
			xrSession.requestReferenceSpace("local")
			.then((xrRefSpace) => {
				g_xrRefSpace = xrRefSpace;

				initActionStates();
				// Note: We create the HUD before creating the
				// recticle, so we can catch the initial
				// "hitteststatechange" event and show the
				// indication that the user should move the
				// device around while the AR tracking is
				// unstable.
				g_hud = new HUD(g_scene);
				setupUIButtons();

				// Construct a textures plane mesh to use as
				// the recticle (instead of the default ring).
				const g = new THREE.PlaneBufferGeometry(0.1, 0.1, 1, 1);
				g.rotateX(-Math.PI / 2);
				const m = new THREE.MeshBasicMaterial();
				m.map = g_texMgr.getTexture("recticle");
				m.transparent = true;

				g_recticle = new Recticle(xrSession, xrRefSpace, g_scene, g_camera, new THREE.Mesh(g, m));
				g_recticle.addEventListener("hitteststatechange", onHitTestStateChange);
				g_recticle.debug = g_debug;
				// Enable the recticle, which will
				// asynchronously try to create an
				// XRHitTestSource.
				g_recticle.enable().catch((err) => {
					// If enabling the recticle fails, we
					// abort the session. Note that we
					// might already be rendering when this
					// happens.
					showMsg(err, "error");
					xrSession.end();
				});

				// Start the rendering loop.
				xrSession.requestAnimationFrame(onXRFrame);
			})
			.catch((err) => {
				showMsg(err, "error");
				// End the session if we failed to get an
				// xrRefSpace.
				xrSession.end();
			});
		}).catch((err) => {
			showMsg(err, "error");
			// Make sure we "clean up".
			if ( g_xrSession ) {
				g_xrSession.end();
			}
		});
	} else {
		// In case we decide the button to be a toggle button.
		g_xrSession.end();
	}
}

function onXRSessionEnded() {
	// Cancel any pending requestAnimationFrame().
	g_xrSession.cancelAnimationFrame(onXRFrame);
	// Not realy needed since we won't be using `g_xrSession` anymore,
	// but just for completeness we deregister the event handler we
	// previously assigned.
	g_xrSession.removeEventListener("select", onXRSessionSelect);

	//showMsg("XRSession ended.", "debug");

	if ( g_recticle ) {
		g_recticle.removeEventListener("hitteststatechange", onHitTestStateChange);
		g_recticle.dispose();
		g_recticle = null;
	}

	if ( g_hud ) {
		g_hud.dispose();
		g_hud = null;
	}

	g_xrSession = null;
	g_xrRefSpace = null;

	if ( g_renderer ) {
		g_renderer.getContext().bindFramebuffer(g_renderer.getContext().FRAMEBUFFER, null);
		g_renderer.dispose();
		g_renderer = null;
		// TODO Dispose of *all* THREE stuff (Mesh, Geometry, Material,
		// Texture)
		g_scene.dispose();
		g_scene = null;
		g_camera = null;
	}

	if ( g_raycaster ) {
		g_raycaster.dispose();
		g_raycaster = null;
	}

	// Cleanup the model.
	// TODO Cleanup the glTF model and also other three.js stuff.
	if ( g_modelMesh ) {
		_resetAngerData(g_modelMesh);
		// Reset the model scale so it's ~30cm again when a new session
		// is be started.
		if ( g_modelMesh.userData.orgHeight != null ) {
			g_modelMesh.scale.setScalar((1 / g_modelMesh.userData.orgHeight) * g_defModelHeight);
			g_modelMesh.userData.isDefaultSize = true;
		}
	}
	stopModelAnimations();

	// Cleanup the roar model.
	// TODO Dispose of the Texture assigned to the material.
	if ( g_roarObj ) {
		const roarSubObj = g_roarObj.getObjectByName("roarObj");
		roarSubObj.geometry.dispose();
		roarSubObj.material.dispose();
		g_roarObj = null;
	}

	if ( g_actionStateMgr ) {
		g_actionStateMgr.clearAll();
		g_actionStateMgr = null;
	}

	// Stop playback of all sounds.
	// Note: We don't call the disposeAll() of g_texMgr and g_audioMgr here,
	// because they are created only once before the session was started.
	// If we would dispose of them here, then the resources would not be
	// available anymore if a new XRSession is started without reloading
	// the page.
	g_audioMgr.stopAll();
}

function onResize() {
	if ( g_renderer ) {
		let w = window.innerWidth;
		let h = window.innerHeight;
		g_renderer.setSize(w, h);

		g_camera.aspect = w / h;
		g_camera.updateProjectionMatrix();
	}
}

function onXRFrame(hrTime, xrFrame) {
	// Request the next frame.
	const xrSession = xrFrame.session;
	xrSession.requestAnimationFrame(onXRFrame);

	// Update the animation mixer of the roar object.
	// TODO Should we use a THREE.Clock instead?
	let deltaSeconds = (hrTime - g_prevHrTime) * 0.001;
	g_prevHrTime = hrTime;
	if ( g_roarObj ) {
		g_roarObj.userData.animMixer.update(deltaSeconds);
	}
	if ( g_animMgr ) {
		g_animMgr.update(deltaSeconds);
	}

	//// DEBUG >>>
	//if ( g_debug && g_gltfModelRig ) {
	//	if ( !g_gltfModelRig.userData.box ) {
	//		g_gltfModelRig.userData.box = new THREE.BoxHelper(g_gltfModelRig);
	//		g_scene.add(g_gltfModelRig.userData.box);
	//	}
	//	g_gltfModelRig.userData.box.update();
	//}
	//// DEBUG <<<

	// Get the viewer's pose.
	const xrViewerPose = xrFrame.getViewerPose(g_xrRefSpace);
	if ( xrViewerPose ) {
		const gl = g_renderer.getContext();
		const xrLayer = xrSession.renderState.baseLayer;

		//gl.bindFramebuffer(gl.FRAMEBUFFER, xrLayer.framebuffer);
		g_renderer.setFramebuffer(xrLayer.framebuffer);

		// TODO Does it make sense to setSize() on resize if we set it
		// here anyway each frame? And/or do we want/need to set the
		// canvas's size here to the framebuffer's size each time (or
		// at all)?
		// Note: The `false` parameter prevents three.js from updating
		// the canvas's style width and height. So only the canvas's
		// dimension are updated.
		// Note: If understood correctly, if the XRWebGLLayer was
		// created with composition disabled (the default), then an
		// 'opaque framebuffer' is created using the provided canvas's
		// context. After that framebuffer is created, its "size cannot
		// be adjusted by the developer after the XRWebGLLayer has been
		// created". So what effect does the g_renderer.setSize() have
		// in the onResize() method? Because that setSize() will change
		// the size of the underlying canvas. But in that case, won't
		// there be a difference between the size of the canvas, and
		// the framebuffer (of the XRWebGLLayer, which has a fixed
		// size)? Or in other words, won't the code below override any
		// changes to the canvas's size after a resize?
		g_renderer.setSize(xrLayer.framebufferWidth, xrLayer.framebufferHeight, false);
		// TODO Do we need to clear? The WebXR docs say that the opaque
		// framebuffer MUST be cleared (by the user agent) prior to
		// processing of each XR animation frame.
		g_renderer.clear();

		for ( let xrView of xrViewerPose.views ) {
			const vp = xrLayer.getViewport(xrView);
			//gl.viewport(vp.x, vp.y, vp.width, vp.height);
			g_renderer.setViewport(vp.x, vp.y, vp.width, vp.height);

			g_camera.projectionMatrix.fromArray(xrView.projectionMatrix);
			// Because `Raycaster::setFromCamera()` internally also
			// calls `unproject(camera)` which then uses
			// `projectionMatrixInverse`, we also need to (manually)
			// update it.
			g_camera.projectionMatrixInverse.getInverse(g_camera.projectionMatrix);
			/*
			// Since render() basically only uses the
			// `projectionMatrix` and `matrixWorldInverse` of the
			// camera, we can just set `matrixWorldInverse`
			// directly instead of having it being updated via
			// setting `matrix` and calling `updateMatrixWorld()`
			// Note: The `matrixWorldInverse` basically acts as the
			// view matrix.
			g_camera.matrixWorldInverse.fromArray(xrView.transform.inverse.matrix);
			*/
			// Because `Raycaster::setFromCamera()` internally uses
			// the camera's `matrixWorld`, we can't just only
			// set the `matrixWorldInverse`.
			g_camera.matrix.fromArray(xrView.transform.matrix);
			// Note: The camera's `updateMatrixWorld()` will also
			// update its `matrixWorldInverse` (based on the
			// current `matrix`).
			// Note: The camera's `matrixAutoUpdate` must be `false`
			// for this to work correctly. Otherwise
			// `updateMatrixWorld()` would call `updateMatrix()`,
			// which would reset the `matrix` (because we didn't
			// set the `position`, `quaternion` & `scale`).
			g_camera.updateMatrixWorld(true);

			// TODO If there are multiple views, then the recticle
			// and hud will be updated multiple times. This is
			// probably not what we want. But updating them outside
			// of the views loop, causes them to use an outdated
			// camera. Which in turn causes "jitter" on the objects
			// that used this outdated camera to update their pose.

			// Update the recticle.
			g_recticle.update(xrFrame);
			// Allow the HUD to update.
			g_hud.update(g_camera);

			g_renderer.render(g_scene, g_camera);

			g_renderer.clearDepth();
		}
	}

	// If there was a select event, then it's callback will have been
	// triggered before this call to onXRFrame(). Because at that time the
	// camera isn't updated yet (while the pose data in the select event
	// is), we postpone actually handling the event until here (i.e. after
	// the camera is also updated with the most recent pose information).
	handleSelectDelayed();
}

/**	In this callback we just get the input's pose and store it in a
 *	`g_storedSelectData` object. We then do the actual ray casting etc. at
 *	the end of the next onXRFrame() animation callback. The latter will
 *	run right after the input event listeners get called (including this
 *	one).
 *	The reason we postpone handling the select event to the end of
 *	onXRFrame(), is because then the camera will be up to date. If we would
 *	do the ray casting here, then the select event's input pose (which in
 *	our case basically corresponds to the camera/viewer) will be (one frame)
 *	newer than the pose that was used to update the g_camera position. And
 *	this would cause a mismatch between the current touch/select position at
 *	which the ray will be casted, and the UI elements that are still at the
 *	"old" camera location.
 *	This one frame delay becomes noticable when moving the device and trying
 *	to click a UI element.
 *
 *	@param {XRInputSourceEvent} evt - The event that triggerd this handler.
 */
function onXRSessionSelect(evt) {
	// Get the touch location as a 3D position in the refSpace.
	// Note: For "generic-touchscreen" XRInputSources, the resulting pose
	// will represent the location where the screen was touched.
	let inputPose = evt.frame.getPose(evt.inputSource.targetRaySpace, g_xrRefSpace);

	// Note: We use a object instead of directly assigning the inputPose to
	// g_storedSelectData because inputPose might be null. And we want to
	// handle a select event even if the inputPose was null (and check the
	// recticle instead). But if we assign directly, then g_storedSelectData
	// will be null and handleSelectDelayed() would think there was nothing
	// to process. Another option would be to use a separate boolean
	// variable (instead of the object) to signal to handleSelectDelayed()
	// that a select event should be processed.
	g_storedSelectData = {
		"inputPose": inputPose
	};
}

function handleSelectDelayed() {
	if ( !g_storedSelectData ) {
		return;
	}

	let gotVirtualHit = false;

	const inputPose = g_storedSelectData.inputPose;
	if ( inputPose ) {
		// TODO If we move while "clicking" then, often it seems that
		// the ray "misses" the HUD elements. Can we prevent this from
		// happening? (Is there a delay between the click event's
		// location being determined, and the ray being executed? I.e.
		// that the camera is already in a new location, before we get
		// the (slightly out-of-date) "select" pose?)
		// => It seems that the "select" happens during the same frame,
		// so no delay there.
		// ==> The select seems to happen closer to the next frame. I.e.
		// the time between end of onXRFrame() and the call of
		// onXRSessionSelect() is almost a whole frame time (~40-60ms).
		// While the time between onXRSessionSelect() and the start of
		// onXRFrame() is smaller (~5-10ms).
		// ===> Looking at the performance profile in the developer
		// tools, then indeed onXRSessionSelect() is called right before
		// the next onXRFrame(). I.e. onXRSessionSelect() is called
		// in the next frame and before the three.js camera is updated
		// for this new frame.
		let hits = g_raycaster.castRay(inputPose, g_hud.getObjectsForRaycasting());
		if ( hits.length > 0 ) {
			const hit = hits[0];
			// DEBUG ->
			console.debug("Got HUD click", hit);
			// DEBUG <-
			// If a HUD's UI element was clicked, then we want to
			// prevent any other click handling.
			gotVirtualHit = true;

			// Don't do any action if the UI element is disabled.
			// Note: Even if the UI element is disabled, we register
			// it as a virtual hit. Otherwise the user could click
			// "through" disabled UI elements, which is probably
			// not the expected behavior.
			if ( !hit.object.userData.disabled ) {
				const action = hit.object.userData.uiAction;
				// Note: We don't play the button sound when
				// the "move" icon is clicked.
				if ( g_btnSndsActive && g_audioMgr && action != "move" ) {
					g_audioMgr.playAudio("btn_pos");
				}
				if ( hit.object.userData.uiCallback ) {
					hit.object.userData.uiCallback(action);
				}
			} else {
				if ( g_btnSndsActive && g_audioMgr ) {
					g_audioMgr.playAudio("btn_neg");
				}
			}
		}
		// If no HUD element got triggered, see if the model was maybe
		// hit.
		// Note: We use the same inputPose again, so RaycasterWrapper
		// doesn't need to calculate the Ray's position and direction.
		if ( !gotVirtualHit ) {
			// Note: We try to test for a hit on the "Totoro"
			// submesh, because otherwise the hit would also trigger
			// for the "Nut" submesh (since their both part of
			// parent `g_modelMesh`).
			// Note: We enable recursive raycasting, because
			// `g_modelMesh` is a Group (of which the actual model
			// is a child). And if the "Totoro" object isn't found
			// (probably because the fallback yellow block is now
			// the model), we still want the raycasting to behave
			// properly.
			const modelToHit = g_modelMesh.getObjectByName("Totoro") || g_modelMesh;
			hits = g_raycaster.castRay(inputPose, [modelToHit], true);
			if ( hits.length > 0 ) {
				const hit = hits[0];
				// DEBUG ->
				console.debug("Got Model hit", hit);
				// DEBUG <-
				handleModelHit(hit);
				gotVirtualHit = true;
			}
		}
	}

	// Clear the variable, so we don't handle this select event again in the
	// next frame.
	// Note: We need do this here (instead of at the end of the function),
	// because if there was no gotVirtualHit then we return early in the
	// code below.
	g_storedSelectData = null;

	// If we handled the "select" via a hit on any of the virtual objects,
	// then skip the recticle "select" handling code.
	// Otherwise for example if the model hasn't been placed yet and if we
	// "select" one of the HUD buttons, then the model would still be placed
	// at the recticle position.
	if ( gotVirtualHit ) {
		return;
	}

	// Only try to place the model on the recticle position, if the recticle
	// is enabled, and "stable". Note that only an enabled recticle can be
	// "stable".
	if ( g_recticle.isStable ) {
		// Note: Instead of performing a new hit test when the screen
		// is touched, we just reuse the recticle's current position.
		// If the model should be placed depending on where at the
		// screen the touch was registered, then we would need to do
		// a new hit test here, that is cast from the touch location.
		// Note: If the recticle is stable, then it will also have a
		// position.
		let recticlePos = g_recticle.getPosition();
		g_modelMesh.position.copy(recticlePos);
		let lookAtPos = new THREE.Vector3();
		// Note: Needs the camera's `matrix` to be set.
		lookAtPos.setFromMatrixPosition(g_camera.matrix);
		// Rotate `g_modelMesh` towards the camera, but keep it upright
		// by using the mesh's own y coordinate in lookAt().
		g_modelMesh.lookAt(lookAtPos.x, g_modelMesh.position.y, lookAtPos.z);
		g_modelMesh.visible = true;

		// Disable the recticle when the model has been placed (until
		// that model is "delete"-ed via the UI).
		g_recticle.disable();
		// Randomly swap the recticle for when it is shown again after
		// the model gets deleted.
		const newRecticleTex = Math.random() < 0.5 ? g_texMgr.getTexture("recticle") : g_texMgr.getTexture("recticle_alt");
		if ( newRecticleTex ) {
			g_recticle.mesh.material.map = newRecticleTex;
		}

		// When the model has been placed, enable the delete button, so
		// it can be "deleted" again. Also enable the scale button.
		g_hud.enableAction("delete");
		g_hud.enableAction("scale");
		g_hud.enableAction("umbrella");
		g_hud.enableAction("whistle");

		// When the model becomes visible, also start its idle
		// animation.
		if ( g_actionStateMgr ) {
			g_actionStateMgr.switchState(MDL_STATE_IDLE);
		}
	}
}

function onHitTestStateChange(evt) {
	if ( g_hud ) {
		if ( evt.detail.state == Recticle.HitTestStates.UNSTABLE ) {
			// Note: We delay showing the notification by 1 second,
			// so it isn't shown when tracking is lost for just a
			// short period. E.g. tracking is reestablished within a
			// second because the user was already moving the device
			// around.
			g_hud.showAction("move", 1);
		} else {
			g_hud.hideAction("move");
		}
	}
}

const MDL_STATE_IDLE = "Idling";
const MDL_STATE_WHISTLE = "Whistling";
const MDL_STATE_UMBRELLA = "Umbrella";
const MDL_STATE_WAVE = "Waving";
let g_timerIdWhistle = 0;
let g_timerIdWaveEnd = 0;
let g_timerIdUmbrellaShow = 0;
let g_timerIdUmbrellaHide = 0;
let g_curWaveSound = "konnichiwa";

function initActionStates() {
	if ( g_actionStateMgr ) {
		// ActionStateManager already set up.
		return;
	}

	g_actionStateMgr = new ActionStateManager();

	// Idle
	g_actionStateMgr.addState(MDL_STATE_IDLE, () => {
		if ( !g_animMgr ) {
			return;
		}
		g_animMgr.queueAnimations([{
			"name": "Idle",
			"loop": true
		}]);
	}, null);

	// Whistle
	g_actionStateMgr.addState(MDL_STATE_WHISTLE, () => {
		if ( !g_animMgr ) {
			return;
		}
		g_animMgr.playAnimations([{
			"name": "Pickup",
			"callback": () => {
				g_timerIdWhistle = window.setTimeout(() => {
					g_timerIdWhistle = 0;
					g_audioMgr.playAudio("flute", g_modelMesh, {"loop": true});
				}, 3300); // Pickup duration ~= 3.6
			}
		}, {
			"name": "Whistle",
			// Switch instantly from Pickup to Whistle.
			"fadeTime": 0,
			"loop": true
		}]);
	}, () => {
		if ( g_animMgr ) {
			g_animMgr.playAnimations([{
				"name": "Pickup",
				"reverse": true,
				"forcePlaythrough": true
			}]);
		}
		if ( g_timerIdWhistle ) {
			window.clearTimeout(g_timerIdWhistle);
			g_timerIdWhistle = 0;
		} else if ( g_audioMgr ) {
			g_audioMgr.stopAudio("flute", {"fadeOutTime": 1});
		}
	});

	// Umbrella
	g_actionStateMgr.addState(MDL_STATE_UMBRELLA, () => {
		if ( !g_animMgr || !g_modelMesh ) {
			console.error("No AnimationManager or model available.");
			return;
		}
		const umbrellaObj = g_modelMesh.getObjectByName("ArmatureUmbrella");
		if ( !umbrellaObj ) {
			console.error("Can't retrieve umbrella object");
			return;
		}

		g_animMgr.playAnimations([{
			"name": "UmbrellaOpen",
			"fadeTime": 0,
			"clamp": true,
			// When a animation was clamped, it will be paused on
			// its last frame. So since it is still "enabled" in
			// this case, it will still influence the "weight
			// normalization" of other animations. So we use the
			// "disableAnims" to disable the specified (clamped)
			// animations.
			"disableAnims": ["UmbrellaClose"],
			"isMixin": true,
// TODO >>> Do we need to use an altRoot? Does it have any impact?
			"altRoot": umbrellaObj
// TODO <<<
		}, {
			"name": "UmbrellaRaise",
			"callback": () => {
				// If there was still a "hide" timeout active,
				// abort it.
				if ( g_timerIdUmbrellaHide ) {
					window.clearTimeout(g_timerIdUmbrellaHide);
					g_timerIdUmbrellaHide = 0;
				}
				// Make the umbrella visible when reaching back.
				g_timerIdUmbrellaShow = window.setTimeout(() => {
					g_timerIdUmbrellaShow = 0;
					umbrellaObj.visible = true;
				}, 600);
				// Play rain sound.
				// Note: We play this as an ambient sound
				// instead of positional.
				if ( g_audioMgr ) {
					g_audioMgr.playAudio("rain", null, {
						"loop": true,
						"fadeInTime": 2
					});
				}
			}
		}, {
			"name": "UmbrellaIdle",
			// Switch instantly from Raise to Idle
			"fadeTime": 0,
			"loop": true
		}]);
	}, () => {
		if ( !g_animMgr || !g_modelMesh ) {
			console.error("No AnimationManager or model available.");
			return;
		}
		const umbrellaObj = g_modelMesh.getObjectByName("ArmatureUmbrella");
		if ( !umbrellaObj ) {
			console.error("Can't retrieve umbrella object");
			return;
		}
// TODO >>> Would be nice if we could associate a callback with the end(/start)
// TODO --- of an animation. So we wouldn't have to use this hard-coded timeout
// TODO --- to hide the umbrella again. <= Won't help if we want to hide the
// TODO --- umbrella before the animation finishes.
		// If there was still a "show" timeout active, abort it.
		if ( g_timerIdUmbrellaShow ) {
			window.clearTimeout(g_timerIdUmbrellaShow);
			g_timerIdUmbrellaShow = 0;
		}
		g_timerIdUmbrellaHide = window.setTimeout(() => {
			g_timerIdUmbrellaHide = 0;
			umbrellaObj.visible = false;
		}, 2360-600);
// TODO <<<

		g_animMgr.playAnimations([{
			"name": "UmbrellaClose",
			"fadeTime": 0,
			"clamp": true,
			"disableAnims": ["UmbrellaOpen"],
			"isMixin": true,
			"altRoot": umbrellaObj
		}, {
			"name": "UmbrellaRaise",
			"reverse": true,
			"forcePlaythrough": true
		}]);

		// Stop the rain sound.
		if ( g_audioMgr ) {
			g_audioMgr.stopAudio("rain", {"fadeOutTime": 2});
		}
	});

	// Wave
	g_actionStateMgr.addState(MDL_STATE_WAVE, (oldState) => {
		if ( !g_animMgr ) {
			return;
		}
		// Start wave animation.
		g_animMgr.playAnimations([{
			"name": "Wave",
			"forcePlayThrough": true
		}]);
		// Switch back to the state from before the wave state (taking
		// into account a default fade time).
		g_timerIdWaveEnd = window.setTimeout(() => {
			g_timerIdWaveEnd = 0;
			g_actionStateMgr.switchState(oldState);
		}, Math.max((g_animMgr.getAnimClip("Wave").duration - g_animMgr.defaultFadeTime) * 1000, 0));
		// Also play one of the "hello" sounds when the waving starts.
		if ( g_audioMgr ) {
			const d = new Date();
			const hour = d.getHours() + d.getMinutes()/60;
			if ( hour > 6 && hour < 10.5 ) {
				g_curWaveSound = "ohayo";
			} else if ( hour >= 10.5 && hour < 21 ) {
				g_curWaveSound = "konnichiwa";
			} else {
				g_curWaveSound = "konbanwa";
			}
			g_audioMgr.playAudio(g_curWaveSound, g_modelMesh);
		}
	}, () => {
		if ( g_timerIdWaveEnd ) {
			window.clearTimeout(g_timerIdWaveEnd);
			g_timerIdWaveEnd = 0;
		}
		if ( g_audioMgr ) {
			g_audioMgr.stopAudio(g_curWaveSound);
		}
	});
}

/**	Adds buttons to the HUD and sets up their action callbacks.
 */
function setupUIButtons() {
	if ( !g_hud ) {
		return;
	}

	// Calculate a button width (and height) based on pixel screen width,
	// but limit between 10% and 20%.
	// Note: Based on Galaxy S3's 768 CSS, and default 0.15 relative width.
	const btnW = Math.max(Math.min((0.15 * 768) / window.innerWidth, 0.2), 0.1);
	const btnH = btnW * g_camera.aspect;
	const spacing = 0.01;

	// Add the UI buttons.
	g_hud.addUIElement(1-spacing-(btnW/2), 1-spacing-(btnH/2), "delete", 0xFFFFFF, btnW, btnH, "icon_remove");
	// The "delete" button should start out as disabled. It will be enabled
	// once the model has been placed.
	g_hud.disableAction("delete");
	g_hud.setActionCallback("delete", () => {
		if ( g_modelMesh && g_modelMesh.visible ) {
			g_modelMesh.visible = false;
			// When the model is "delete"-ed, also reset its
			// angerData.
			_resetAngerData(g_modelMesh);
			// And stop any animation.
			stopModelAnimations();
			// Also stop playback of any audio.
			if ( g_audioMgr ) {
				g_audioMgr.stopAll();
			}

			// Re-enable the recticle when the model is "delete"-ed.
			// Note that the recticle probably won't be stable
			// right away after enabling it again.
			g_recticle.enable();

			// Disable the delete, scale, umbrella and whistle
			// buttons after the model has been "deleted".
			g_hud.disableAction("delete");
			g_hud.disableAction("scale");
			g_hud.disableAction("umbrella");
			g_hud.disableAction("whistle");

			// Reset the model's action state.
			g_actionStateMgr.reset();

			// Also make sure the umbrella is hidden again.
			const umbrellaObj = g_modelMesh.getObjectByName("ArmatureUmbrella");
			if ( umbrellaObj ) {
				umbrellaObj.visible = false;
			}
		}
	});

	g_hud.addUIElement(1-spacing-(btnW/2), spacing+btnH/2, "exit", 0xFFFFFF, btnW, btnH, "icon_exit");
	g_hud.setActionCallback("exit", () => {
		// Exit the XR session.
		g_xrSession.end();
	});

	g_hud.addUIElement(spacing+(btnW*(0.2/0.15))/2, spacing+(btnH*(0.2/0.15))/2, "move", 0xFFFFFF, btnW*(0.2/0.15), btnH*(0.2/0.15), "icon_move");
	// Hide the "move" element by default.
	g_hud.hideAction("move");

	g_hud.addUIElement(spacing+(btnW/2) + 0*(btnW+spacing), 1-spacing-btnH/2, "scale", 0xFFFFFF, btnW, btnH, "icon_scale");
	g_hud.disableAction("scale");
	g_hud.setActionCallback("scale", () => {
		// If the glTF model was loaded, toggle its scale between
		// tabletop and "real life" size.
		if ( g_modelMesh && g_modelMesh.userData.orgHeight ) {
			let scaleFactor = (1 / g_modelMesh.userData.orgHeight);
			if ( g_modelMesh.userData.isDefaultSize ) {
				scaleFactor *= g_enlargedModelHeight;
			} else {
				scaleFactor *= g_defModelHeight;
			}
			g_modelMesh.scale.setScalar(scaleFactor);
			g_modelMesh.userData.isDefaultSize = !g_modelMesh.userData.isDefaultSize;
		}
	});

	g_hud.addUIElement(spacing+(btnW/2) + 1*(btnW+spacing), 1-spacing-btnH/2, "umbrella", 0xFFFFFF, btnW, btnH, "icon_umbrella");
	g_hud.disableAction("umbrella");
	g_hud.setActionCallback("umbrella", () => {
		g_actionStateMgr.toggleState(MDL_STATE_UMBRELLA, MDL_STATE_IDLE);
	});

	g_hud.addUIElement(spacing+(btnW/2) + 2*(btnW+spacing), 1-spacing-btnH/2, "whistle", 0xFFFFFF, btnW, btnH, "icon_whistle");
	g_hud.disableAction("whistle");
	g_hud.setActionCallback("whistle", () => {
		g_actionStateMgr.toggleState(MDL_STATE_WHISTLE, MDL_STATE_IDLE);
	});
}

/**	Stops all animations of the glTF model.
 */
function stopModelAnimations() {
	if ( g_animMgr ) {
		g_animMgr.stopAll();
	}

	// Also make sure any of the action/animations state change related
	// timers no longer fire.
	if ( g_timerIdWhistle ) {
		window.clearTimeout(g_timerIdWhistle);
		g_timerIdWhistle = 0;
	}
	if ( g_timerIdWaveEnd ) {
		window.clearTimeout(g_timerIdWaveEnd);
		g_timerIdWaveEnd = 0;
	}
	if ( g_timerIdUmbrellaShow ) {
		window.clearTimeout(g_timerIdUmbrellaShow);
		g_timerIdUmbrellaShow = 0;
	}
	if ( g_timerIdUmbrellaHide ) {
		window.clearTimeout(g_timerIdUmbrellaHide);
		g_timerIdUmbrellaHide = 0;
	}
}


function _resetAngerData(model) {
	if ( model.userData.angerData && model.userData.angerData.coolOffId ) {
		window.clearTimeout(model.userData.angerData.coolOffId);
	}
	model.userData.angerData = {
		level: 0,
		cooldown: 0,
		coolOffId: null,
	};
}

function _coolOffFn(angerData) {
	if ( angerData.level > 0 ) {
		angerData.level -= 1;
		// Play a sigh sound, so the user knows something has happened.
		g_audioMgr.playAudio("sigh", g_modelMesh);
		// DEBUG ->
		console.debug(`Dropped anger level to ${angerData.level}`);
		// DEBUG <-
	}
	if ( angerData.level > 0 ) {
		// If the new anger level is still not the lowest level, then
		// launch a new cool-off timer to drop the anger level further.
		angerData.coolOffId = window.setTimeout(_coolOffFn, 5000, angerData);
	} else {
		// If we cooled-off to level 0, then we should clear the
		// timeout id, since there is no more pending cool-off timeout.
		angerData.coolOffId = null;
	}
}

function handleModelHit(hit) {
	const curTime = performance.now(); //ms

	// Only consider the "angering" when we're in the idle state. Otherwise
	// just play the nopoke sound and return early.
	// We do this mainly to prevent the animations from mixing up. Which
	// wouldn't look correctly because for example the poke animation
	// isn't additive. Which in turn would result the umbrella or nut to
	// switch to a half-way position while the current and poke animation
	// would be playing.
	// NOTE --- If we would allow "angering" in other states then IDLE, we
	// should instead check here if the current state is the WAVE state.
	// And in that case we should still return early (as otherwise the
	// anger level could grow while we're still in the WAVE (a.k.a. anger)
	// state).
	if ( !g_actionStateMgr || g_actionStateMgr.getState() != MDL_STATE_IDLE ) {
		// Don't play the "nopoke" sound while we're still waving, i.e.
		// while the "niichan" sound is still playing.
		if ( g_actionStateMgr.getState() != MDL_STATE_WAVE ) {
			g_audioMgr.playAudio("nopoke", g_modelMesh);
		}
		return;
	}

	// On the first hit angerData won't be available yet, so initialize it.
	if ( !g_modelMesh.userData.angerData ) {
		_resetAngerData(g_modelMesh);
	}
	const angerData = g_modelMesh.userData.angerData;

	// Each time the model is hit, start (or reset) the cool-off timeout.
	// If the model isn't hit before the timeout expires in 5s, then the
	// timeout function will drop the anger level by one (and start a new
	// cool-off timer to drop the level further, until reaching level 0).
	if ( angerData.coolOffId ) {
		window.clearTimeout(angerData.coolOffId);
	}
	angerData.coolOffId = window.setTimeout(_coolOffFn, 5000, angerData);

	// Require a cooldown of 2.5s before allowing a new hit to increase
	// the anger level. If the user clicked the model before this cooldown
	// period has expired, we'll reset the cooldown period. I.e. the user
	// will have to wait another cooldown period before the anger level can
	// be increased.
	const cooldownExpireTime = angerData.cooldown;
	angerData.cooldown = curTime + 2500;
	if ( curTime <= cooldownExpireTime ) {
		// DEBUG ->
		console.log("Too eager! Resetting cooldown.");
		// DEBUG <-
		// Play a default light grunt sound, but don't increase
		// the anger level.
		g_audioMgr.playAudio("nopoke", g_modelMesh);

		// Don't do anything else when the user clicked the model too
		// fast.
		return;
	}

	// If the hit happend after the cooldown period and before the cool-off
	// timer timed out, then increase the anger level.
	angerData.level += 1;
	// DEBUG ->
	console.log(`Anger level increased to: ${angerData.level}`);
	// DEBUG <-

	let soundToPlay = null;
	let animsToPlay = [{
		"name": "Poked",
		"fadeTime": 0.1,
		"isMixin": true
	}];
	switch ( angerData.level ) {
		case 3:
			// We'll switch to the WAVE state in this case, which
			// will trigger the wave animation and the accompanying
			// "niichan" sound for us.
			animsToPlay = null;
			break;
		case 2:
			soundToPlay = "poke2";
			break;
		case 1:
		default:
			soundToPlay = "poke1";
	}

	if ( animsToPlay ) {
		g_animMgr.playAnimations(animsToPlay);
	}
	if ( soundToPlay ) {
		g_audioMgr.playAudio(soundToPlay, g_modelMesh);
	}

	// Maximum anger level reached.
	if ( angerData.level >= 3 ) {
		// Reset the anger data when switching to the WAVE state. Note
		// that since we currently only allow the anger level to
		// increase while in the IDLE state, any further angering is
		// disabled until we switch back to the IDLE state (which the
		// WAVE state will do automatically).
		_resetAngerData(g_modelMesh);
		g_actionStateMgr.switchState(MDL_STATE_WAVE);

		// Trigger the "roar event".
		triggerRoarEffect();
	}
}

/**	@param {number} duration - (optional) The duration of the animation. In seconds. Default 1s.
 *	@param {Array.<number>} startPos - (optional) The start position of the animation, as a three-element array. Default [O, O, O].
 *	@param {Array.<number>} endPos - (optional) The end position of the animation, as a three-element array. Default [0, 0, 1].
 *	@param {Array.<number>} startScale - (optional) The scale to start the animation at, as a three-element array. Default [1, 1, 1].
 *	@param {Array.<number>} endScale - (optional) The scale to end the animation at, as a three-element array. Default [5, 5, 5].
 *	@param {number} maxOpacity - (optional) The maximum opacity to use. Default 1.0.
 *	@see https://threejs.org/examples/js/animation/AnimationClipCreator.js
 */
function createRoarAnimationClip(duration, startPos, endPos, startScale, endScale, maxOpacity) {
	duration = duration || 1.0;
	startPos = startPos || [0, 0, 0];
	endPos = endPos || [0, 0, 1];
	startScale = startScale || [1, 1, 1];
	endScale = endScale || [5, 5, 5];
	maxOpacity = maxOpacity || 1.0;

	const tracks = [];

	let times = [0, 0.25 * duration, 0.75 * duration, 1 * duration];
	let values = [0, maxOpacity, maxOpacity, 0];
	let trackName = ".material.opacity"; // ".material[0].opacity"
	tracks.push(new THREE.NumberKeyframeTrack(trackName, times, values));

	times = [0, 1 * duration];
	values = [...startScale, ...endScale];
	trackName = ".scale";
	tracks.push(new THREE.VectorKeyframeTrack(trackName, times, values));

	values = [...startPos, ...endPos];
	trackName = ".position";
	tracks.push(new THREE.VectorKeyframeTrack(trackName, times, values));

	times = [0, duration];
	values = [true, false];
	trackName = ".visible";
	tracks.push(new THREE.BooleanKeyframeTrack(trackName, times, values));

	return new THREE.AnimationClip("roar", duration, tracks);
}

function createRoarObject(size, texture, animationDuration, opacity) {
	size = size || 0.1;
	const geom = new THREE.PlaneBufferGeometry(size, size, 1, 1);
	// Note: Since we'll want to modify the opacity, we need to set the
	// `transparent` option to `true`.
	const mat = new THREE.MeshBasicMaterial({transparent: true});
	mat.side = THREE.DoubleSide;
	if ( texture ) {
		mat.map = texture;
	}
	const roarObj = new THREE.Mesh(geom, mat);
	roarObj.visible = false;
	roarObj.name = "roarObj";
	const roarClip = createRoarAnimationClip(animationDuration, null, null, null, null, opacity);
	roarObj.animations = [roarClip];

	// Create a parent object. This way the animation on the `roarObj`
	// doesn't need to bother about the position and direction, as these
	// will be relative to the `group` object. While we can just position
	// and rotate the `group` object any way we want.
	// Note though, that we'll need to access the "roarObj" sub-object to
	// get to the animations.
	const group = new THREE.Group();
	group.add(roarObj);
	// Store the animation clip of the roarObj sub-object and an
	// AnimationMixer for that clip as userData on the parent `group`
	// object.
	// Note: We store the `roarClip` directly in the `userData`, so we don't
	// have to search for it via AnimationClip.findByName().
	group.userData.animClip = roarClip;
	group.userData.animMixer = new THREE.AnimationMixer(roarObj);
	group.userData.animMixer.addEventListener("finished", (evt) => {
		// Explicitly stop the roar animation when it finishes.
		// This will deactivate the animation so it's `isScheduled()`
		// will no longer be true. I.e. if an animation finishes, it's
		// not automatically deactivated. And this would cause the roar
		// event to not be allowed to trigger a second time, since
		// triggerRoarEffect() checks to see if `isScheduled()` is false
		// before allowing the animation to be started (again).
		// Note: We don't bother to check if the event's action is
		// the roar animation action, since this AnimationMixer is only
		// used for that action.
		evt.action.stop();
	});

	return group;
}

function triggerRoarEffect() {
	if ( g_roarObj && g_modelMesh && g_camera ) {
		// Position the roar object at the center of `g_modelMesh`, and
		// rotate it towards the camera.
		const boxSize = new THREE.Vector3();
		const bbox = new THREE.Box3();
		bbox.setFromObject(g_modelMesh).getSize(boxSize);

		g_roarObj.position.copy(g_modelMesh.position);
		g_roarObj.position.y += boxSize.y / 2;
		let lookAtPos = new THREE.Vector3();
		lookAtPos.setFromMatrixPosition(g_camera.matrix);
		g_roarObj.lookAt(lookAtPos);
		// Scale the roar effect's according to the model's current
		// size.
		if ( g_modelMesh.userData.isDefaultSize ) {
			g_roarObj.scale.setScalar(1);
		} else {
			scaleDiffFactor = g_enlargedModelHeight / g_defModelHeight;
			// Note: We don't scale the z-axis because we only want
			// to enlarge the plane, not the distance it travels
			// towards the camera.
			g_roarObj.scale.set(scaleDiffFactor, scaleDiffFactor, 1);
		}

		// Get the AnimationClip, create an AnimationAction from it via
		// the AnimationMixer, and then play() it (if it's not already
		// playing).
		//const clip = THREE.AnimationClip.findByName(g_roarObj.getObjectByName("roarObj").animations, "roar");
		const clip = g_roarObj.userData.animClip;
		const action = g_roarObj.userData.animMixer.clipAction(clip);
		// Note: Since we start the action with a delay, we can't rely
		// on isRunning() to make sure the animation isn't started again
		// before it has finished after a previous call to play(). This
		// is because `isRunning()` won't return true until the delayed
		// action actually starts the animation. I.e. during the delay
		// period `isRunning()` would return `false`.
		// Note: When the action finishes it will be stop()-ed (see
		// finish event listener in `createRoarObject()`), which will
		// also reset() the animation action.
		if ( !action.isRunning() ) {
			action.setLoop(THREE.LoopOnce); // Default is LoopRepeat.
			// Note: We delay the event so it lines up with the
			// roar animation better.
			action.startAt(g_roarObj.userData.animMixer.time + 0.5).play();
			// DEBUG ->
			console.debug("Playing roar animation.");
			// DEBUG <-
		}
		// DEBUG ->
		else {
			console.debug("Roar animation already running.");
		}
		// DEBUG <-
	}
}

// Wait for the DOM to be available before initializing.
if ( document.readyState === "loading" ) {
	document.addEventListener("DOMContentLoaded", init);
} else {
	init();
}

