//#region \0rolldown/runtime.js
var e = Object.create, t = Object.defineProperty, n = Object.getOwnPropertyDescriptor, r = Object.getOwnPropertyNames, i = Object.getPrototypeOf, a = Object.prototype.hasOwnProperty, o = (e, t) => () => (t || (e((t = { exports: {} }).exports, t), e = null), t.exports), s = (e, i, o, s) => {
	if (i && typeof i == "object" || typeof i == "function") for (var c = r(i), l = 0, u = c.length, d; l < u; l++) d = c[l], !a.call(e, d) && d !== o && t(e, d, {
		get: ((e) => i[e]).bind(null, d),
		enumerable: !(s = n(i, d)) || s.enumerable
	});
	return e;
}, c = (n, r, o) => (o = n == null ? {} : e(i(n)), s(r || !n || !n.__esModule || !a.call(n, "default") ? t(o, "default", {
	value: n,
	enumerable: !0
}) : o, n)), l = class extends Error {
	constructor(e) {
		let t;
		t = e instanceof Error ? e.message : typeof e == "string" ? e : "", super(t), this.name = this.constructor.name;
	}
}, u = class extends l {}, d = class extends l {}, f = class extends l {}, p = class extends l {}, m = class extends l {}, h = class extends l {}, ee = class extends l {}, te = class extends l {}, ne = class extends l {}, re = class extends l {}, g = class extends l {}, ie = _(globalThis, {});
function _(e, t) {
	return new Proxy(e, {
		get(n, r, i) {
			return r in t ? t[r] : e[r];
		},
		set(n, r, i) {
			return r in t && delete t[r], e[r] = i, !0;
		},
		deleteProperty(n, r) {
			let i = !1;
			return r in t && (delete t[r], i = !0), r in e && (delete e[r], i = !0), i;
		},
		ownKeys(n) {
			let r = Reflect.ownKeys(e), i = Reflect.ownKeys(t), a = new Set(i);
			return [...r.filter((e) => !a.has(e)), ...i];
		},
		defineProperty(n, r, i) {
			return r in t && delete t[r], Reflect.defineProperty(e, r, i), !0;
		},
		getOwnPropertyDescriptor(n, r) {
			return r in t ? Reflect.getOwnPropertyDescriptor(t, r) : Reflect.getOwnPropertyDescriptor(e, r);
		},
		has(n, r) {
			return r in t || r in e;
		}
	});
}
//#endregion
//#region __vite-browser-external
var ae = /* @__PURE__ */ o(((e, t) => {
	t.exports = {};
}));
//#endregion
//#region ../../node_modules/.pnpm/@hpke+common@1.10.1/node_modules/@hpke/common/esm/src/algorithm.js
async function oe() {
	if (ie !== void 0 && globalThis.crypto !== void 0) return globalThis.crypto.subtle;
	try {
		let { webcrypto: e } = await Promise.resolve().then(() => /* @__PURE__ */ c(ae()));
		return e.subtle;
	} catch (e) {
		throw new g(e);
	}
}
var v = class {
	constructor() {
		Object.defineProperty(this, "_api", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		});
	}
	async _setup() {
		this._api === void 0 && (this._api = await oe());
	}
}, y = {
	Base: 0,
	Psk: 1,
	Auth: 2,
	AuthPsk: 3
}, b = {
	NotAssigned: 0,
	DhkemP256HkdfSha256: 16,
	DhkemP384HkdfSha384: 17,
	DhkemP521HkdfSha512: 18,
	DhkemSecp256k1HkdfSha256: 19,
	DhkemX25519HkdfSha256: 32,
	DhkemX448HkdfSha512: 33,
	HybridkemX25519Kyber768: 48,
	MlKem512: 64,
	MlKem768: 65,
	MlKem1024: 66,
	XWing: 25722
}, x = {
	HkdfSha256: 1,
	HkdfSha384: 2,
	HkdfSha512: 3,
	Sha3256: 4,
	Sha3384: 5,
	Sha3512: 6,
	Shake128: 16,
	Shake256: 17,
	TurboShake128: 18,
	TurboShake256: 19
}, S = {
	Aes128Gcm: 1,
	Aes256Gcm: 2,
	Chacha20Poly1305: 3,
	ExportOnly: 65535
}, C = /* @__PURE__ */ new Uint8Array(), se = /* @__PURE__ */ (() => {
	let e = Array(256), t = 0, n = 0n;
	for (; t < 256;) e[t] = n, t++, n += 1n;
	return e;
})(), ce = /* @__PURE__ */ new Uint8Array([
	75,
	69,
	77,
	0,
	0
]), w = /* @__PURE__ */ new Uint8Array([
	72,
	80,
	75,
	69,
	45,
	118,
	49
]);
function T(e) {
	return new Uint8Array(E(e));
}
function E(e) {
	return e instanceof ArrayBuffer ? e : ArrayBuffer.isView(e) ? new Uint8Array(e.buffer, e.byteOffset, e.byteLength).slice().buffer : new Uint8Array(e).slice().buffer;
}
var le = class extends v {
	constructor() {
		super(), Object.defineProperty(this, "id", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: x.HkdfSha256
		}), Object.defineProperty(this, "hashSize", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: 0
		}), Object.defineProperty(this, "_suiteId", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: C
		}), Object.defineProperty(this, "algHash", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: {
				name: "HMAC",
				hash: "SHA-256",
				length: 256
			}
		});
	}
	init(e) {
		this._suiteId = e;
	}
	buildLabeledIkm(e, t) {
		this._checkInit();
		let n = new Uint8Array(7 + this._suiteId.byteLength + e.byteLength + t.byteLength);
		return n.set(w, 0), n.set(this._suiteId, 7), n.set(e, 7 + this._suiteId.byteLength), n.set(t, 7 + this._suiteId.byteLength + e.byteLength), n;
	}
	buildLabeledInfo(e, t, n) {
		this._checkInit();
		let r = new Uint8Array(9 + this._suiteId.byteLength + e.byteLength + t.byteLength);
		return r.set(new Uint8Array([0, n]), 0), r.set(w, 2), r.set(this._suiteId, 9), r.set(e, 9 + this._suiteId.byteLength), r.set(t, 9 + this._suiteId.byteLength + e.byteLength), r;
	}
	async extract(e, t) {
		await this._setup();
		let n = e.byteLength === 0 ? new ArrayBuffer(this.hashSize) : E(e);
		if (n.byteLength !== this.hashSize) throw new u("The salt length must be the same as the hashSize");
		let r = E(t), i = await this._api.importKey("raw", n, this.algHash, !1, ["sign"]);
		return await this._api.sign("HMAC", i, r);
	}
	async expand(e, t, n) {
		await this._setup();
		let r = E(e), i = await this._api.importKey("raw", r, this.algHash, !1, ["sign"]), a = new ArrayBuffer(n), o = new Uint8Array(a), s = C, c = T(t), l = /* @__PURE__ */ new Uint8Array(1);
		if (n > 255 * this.hashSize) throw Error("Entropy limit reached");
		let u = new Uint8Array(this.hashSize + c.length + 1);
		for (let e = 1, t = 0; t < o.length; e++) l[0] = e, u.set(s, 0), u.set(c, s.length), u.set(l, s.length + c.length), s = new Uint8Array(await this._api.sign("HMAC", i, u.slice(0, s.length + c.length + 1))), o.length - t >= s.length ? (o.set(s, t), t += s.length) : (o.set(s.slice(0, o.length - t), t), t += o.length - t);
		return a;
	}
	async extractAndExpand(e, t, n, r) {
		await this._setup();
		let i = E(t), a = await this._api.importKey("raw", i, "HKDF", !1, ["deriveBits"]);
		return await this._api.deriveBits({
			name: "HKDF",
			hash: this.algHash.hash,
			salt: E(e),
			info: E(n)
		}, a, r * 8);
	}
	async labeledExtract(e, t, n) {
		return await this.extract(e, this.buildLabeledIkm(t, n));
	}
	async labeledExpand(e, t, n, r) {
		return await this.expand(e, this.buildLabeledInfo(t, n, r), r);
	}
	_checkInit() {
		if (this._suiteId === C) throw Error("Not initialized. Call init()");
	}
}, D = class extends le {
	constructor() {
		super(...arguments), Object.defineProperty(this, "id", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: x.HkdfSha256
		}), Object.defineProperty(this, "hashSize", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: 32
		}), Object.defineProperty(this, "algHash", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: {
				name: "HMAC",
				hash: "SHA-256",
				length: 256
			}
		});
	}
}, O = (e) => typeof e == "object" && !!e && typeof e.privateKey == "object" && typeof e.publicKey == "object";
function k(e, t) {
	if (t <= 0) throw Error("i2Osp: too small size");
	if (e >= 256 ** t) throw Error("i2Osp: too large integer");
	let n = new Uint8Array(t);
	for (let r = 0; r < t && e; r++) n[t - (r + 1)] = e % 256, e = Math.floor(e / 256);
	return n;
}
function A(e, t) {
	let n = new Uint8Array(e.length + t.length);
	return n.set(e, 0), n.set(t, e.length), n;
}
function ue(e) {
	let t = e.replace(/-/g, "+").replace(/_/g, "/"), n = atob(t), r = new Uint8Array(n.length);
	for (let e = 0; e < n.length; e++) r[e] = n.charCodeAt(e);
	return r;
}
function de(e, t) {
	if (e.byteLength !== t.byteLength) throw Error("xor: different length inputs");
	let n = new Uint8Array(e.byteLength);
	for (let r = 0; r < e.byteLength; r++) n[r] = e[r] ^ t[r];
	return n;
}
//#endregion
//#region ../../node_modules/.pnpm/@hpke+common@1.10.1/node_modules/@hpke/common/esm/src/kems/dhkem.js
var fe = /* @__PURE__ */ new Uint8Array([
	101,
	97,
	101,
	95,
	112,
	114,
	107
]), pe = /* @__PURE__ */ new Uint8Array([
	115,
	104,
	97,
	114,
	101,
	100,
	95,
	115,
	101,
	99,
	114,
	101,
	116
]);
function me(e, t, n) {
	let r = new Uint8Array(e.length + t.length + n.length);
	return r.set(e, 0), r.set(t, e.length), r.set(n, e.length + t.length), r;
}
var j = class {
	constructor(e, t, n) {
		Object.defineProperty(this, "id", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), Object.defineProperty(this, "secretSize", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: 0
		}), Object.defineProperty(this, "encSize", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: 0
		}), Object.defineProperty(this, "publicKeySize", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: 0
		}), Object.defineProperty(this, "privateKeySize", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: 0
		}), Object.defineProperty(this, "_prim", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), Object.defineProperty(this, "_kdf", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), this.id = e, this._prim = t, this._kdf = n;
		let r = new Uint8Array(ce);
		r.set(k(this.id, 2), 3), this._kdf.init(r);
	}
	async serializePublicKey(e) {
		return await this._prim.serializePublicKey(e);
	}
	async deserializePublicKey(e) {
		return await this._prim.deserializePublicKey(E(e));
	}
	async serializePrivateKey(e) {
		return await this._prim.serializePrivateKey(e);
	}
	async deserializePrivateKey(e) {
		return await this._prim.deserializePrivateKey(E(e));
	}
	async importKey(e, t, n = !0) {
		return await this._prim.importKey(e, t, n);
	}
	async generateKeyPair() {
		return await this._prim.generateKeyPair();
	}
	async deriveKeyPair(e) {
		let t = E(e);
		if (t.byteLength > 8192) throw new u("Too long ikm");
		return await this._prim.deriveKeyPair(t);
	}
	async encap(e) {
		let t;
		t = e.ekm === void 0 ? await this.generateKeyPair() : O(e.ekm) ? e.ekm : await this.deriveKeyPair(e.ekm);
		let n = await this._prim.serializePublicKey(t.publicKey), r = await this._prim.serializePublicKey(e.recipientPublicKey);
		try {
			let i;
			if (e.senderKey === void 0) i = new Uint8Array(await this._prim.dh(t.privateKey, e.recipientPublicKey));
			else {
				let n = O(e.senderKey) ? e.senderKey.privateKey : e.senderKey;
				i = A(new Uint8Array(await this._prim.dh(t.privateKey, e.recipientPublicKey)), new Uint8Array(await this._prim.dh(n, e.recipientPublicKey)));
			}
			let a;
			if (e.senderKey === void 0) a = A(new Uint8Array(n), new Uint8Array(r));
			else {
				let t = O(e.senderKey) ? e.senderKey.publicKey : await this._prim.derivePublicKey(e.senderKey), i = await this._prim.serializePublicKey(t);
				a = me(new Uint8Array(n), new Uint8Array(r), new Uint8Array(i));
			}
			return {
				enc: n,
				sharedSecret: await this._generateSharedSecret(i, a)
			};
		} catch (e) {
			throw new p(e);
		}
	}
	async decap(e) {
		let t = E(e.enc), n = await this._prim.deserializePublicKey(t), r = O(e.recipientKey) ? e.recipientKey.privateKey : e.recipientKey, i = O(e.recipientKey) ? e.recipientKey.publicKey : await this._prim.derivePublicKey(e.recipientKey), a = await this._prim.serializePublicKey(i);
		try {
			let i;
			i = e.senderPublicKey === void 0 ? new Uint8Array(await this._prim.dh(r, n)) : A(new Uint8Array(await this._prim.dh(r, n)), new Uint8Array(await this._prim.dh(r, e.senderPublicKey)));
			let o;
			if (e.senderPublicKey === void 0) o = A(new Uint8Array(t), new Uint8Array(a));
			else {
				let n = await this._prim.serializePublicKey(e.senderPublicKey);
				o = new Uint8Array(t.byteLength + a.byteLength + n.byteLength), o.set(new Uint8Array(t), 0), o.set(new Uint8Array(a), t.byteLength), o.set(new Uint8Array(n), t.byteLength + a.byteLength);
			}
			return await this._generateSharedSecret(i, o);
		} catch (e) {
			throw new m(e);
		}
	}
	async _generateSharedSecret(e, t) {
		let n = this._kdf.buildLabeledIkm(fe, e), r = this._kdf.buildLabeledInfo(pe, t, this.secretSize);
		return await this._kdf.extractAndExpand(C, n, r, this.secretSize);
	}
}, M = ["deriveBits"], N = /* @__PURE__ */ new Uint8Array([
	100,
	107,
	112,
	95,
	112,
	114,
	107
]), P = class {
	constructor(e) {
		Object.defineProperty(this, "_num", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), this._num = new Uint8Array(e);
	}
	val() {
		return this._num;
	}
	reset() {
		this._num.fill(0);
	}
	set(e) {
		if (e.length !== this._num.length) throw Error("Bignum.set: invalid argument");
		this._num.set(e);
	}
	isZero() {
		for (let e = 0; e < this._num.length; e++) if (this._num[e] !== 0) return !1;
		return !0;
	}
	lessThan(e) {
		if (e.length !== this._num.length) throw Error("Bignum.lessThan: invalid argument");
		for (let t = 0; t < this._num.length; t++) {
			if (this._num[t] < e[t]) return !0;
			if (this._num[t] > e[t]) return !1;
		}
		return !1;
	}
}, F = /* @__PURE__ */ new Uint8Array([
	99,
	97,
	110,
	100,
	105,
	100,
	97,
	116,
	101
]), I = /* @__PURE__ */ new Uint8Array([
	255,
	255,
	255,
	255,
	0,
	0,
	0,
	0,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	188,
	230,
	250,
	173,
	167,
	23,
	158,
	132,
	243,
	185,
	202,
	194,
	252,
	99,
	37,
	81
]), L = /* @__PURE__ */ new Uint8Array([
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	199,
	99,
	77,
	129,
	244,
	55,
	45,
	223,
	88,
	26,
	13,
	178,
	72,
	176,
	167,
	122,
	236,
	236,
	25,
	106,
	204,
	197,
	41,
	115
]), R = /* @__PURE__ */ new Uint8Array([
	1,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	255,
	250,
	81,
	134,
	135,
	131,
	191,
	47,
	150,
	107,
	127,
	204,
	1,
	72,
	247,
	9,
	165,
	208,
	59,
	181,
	201,
	184,
	137,
	156,
	71,
	174,
	187,
	111,
	183,
	30,
	145,
	56,
	100,
	9
]), z = /* @__PURE__ */ new Uint8Array([
	48,
	65,
	2,
	1,
	0,
	48,
	19,
	6,
	7,
	42,
	134,
	72,
	206,
	61,
	2,
	1,
	6,
	8,
	42,
	134,
	72,
	206,
	61,
	3,
	1,
	7,
	4,
	39,
	48,
	37,
	2,
	1,
	1,
	4,
	32
]), he = /* @__PURE__ */ new Uint8Array([
	48,
	78,
	2,
	1,
	0,
	48,
	16,
	6,
	7,
	42,
	134,
	72,
	206,
	61,
	2,
	1,
	6,
	5,
	43,
	129,
	4,
	0,
	34,
	4,
	55,
	48,
	53,
	2,
	1,
	1,
	4,
	48
]), ge = /* @__PURE__ */ new Uint8Array([
	48,
	96,
	2,
	1,
	0,
	48,
	16,
	6,
	7,
	42,
	134,
	72,
	206,
	61,
	2,
	1,
	6,
	5,
	43,
	129,
	4,
	0,
	35,
	4,
	73,
	48,
	71,
	2,
	1,
	1,
	4,
	66
]), _e = {
	p: 115792089210356248762697446949407573530086143415290314195533631308867097853951n,
	b: 41058363725152142129326129780047268409114441015993725554835256314039467401291n,
	gx: 48439561293906451759052585252797914202762949526041747995844080717082404635286n,
	gy: 36134250956749795798585127919587881956611106672985015071877198253568414405109n,
	coordinateSize: 32
}, ve = {
	p: 39402006196394479212279040100143613805079739270465446667948293404245721771496870329047266088258938001861606973112319n,
	b: 27580193559959705877849011840389048093056905856361568521428707301988689241309860865136260764883745107765439761230575n,
	gx: 26247035095799689268623156744566981891852923491109213387815615900925518854738050089022388053975719786650872476732087n,
	gy: 8325710961489029985546751289520108179287853048861315594709205902480503199884419224438643760392947333078086511627871n,
	coordinateSize: 48
}, ye = {
	p: (1n << 521n) - 1n,
	b: 1093849038073734274511112390766805569936207598951683748994586394495953116150735016013708737573759623248592132296706313309438452531591012912142327488478985984n,
	gx: 2661740802050217063228768716723360960729859168756973147706671368418802944996427808491545080627771902352094241225065558662157113545570916814161637315895999846n,
	gy: 3757180025770020463545507224491183603594455134769762486694567779615544477440556316691234405012945539562144444537289428522585666729196580810124344277578376784n,
	coordinateSize: 66
};
function B(e, t) {
	let n = e % t;
	return n >= 0n ? n : n + t;
}
function V(e, t, n) {
	let r = 1n, i = B(e, n), a = t;
	for (; a > 0n;) (a & 1n) == 1n && (r = B(r * i, n)), i = B(i * i, n), a >>= 1n;
	return r;
}
function be(e, t) {
	let n = V(e, t + 1n >> 2n, t);
	if (B(n * n, t) !== B(e, t)) throw Error("Invalid ECDH point");
	return n;
}
function xe(e) {
	let t = 0n;
	for (let n of e) t = t << 8n | se[n];
	return t;
}
function H(e, t) {
	let n = new Uint8Array(t), r = e;
	for (let e = t - 1; e >= 0; e--) n[e] = Number(r & 255n), r >>= 8n;
	if (r !== 0n) throw Error("Invalid coordinate length");
	return n;
}
function U(e, t, n) {
	let r = new Uint8Array(1 + n * 2);
	return r[0] = 4, r.set(H(e, n), 1), r.set(H(t, n), 1 + n), r;
}
var Se = class extends v {
	constructor(e, t) {
		switch (super(), Object.defineProperty(this, "_hkdf", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), Object.defineProperty(this, "_alg", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), Object.defineProperty(this, "_nPk", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), Object.defineProperty(this, "_nSk", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), Object.defineProperty(this, "_nDh", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), Object.defineProperty(this, "_order", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), Object.defineProperty(this, "_bitmask", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), Object.defineProperty(this, "_pkcs8AlgId", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), Object.defineProperty(this, "_curveParams", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), this._hkdf = t, e) {
			case b.DhkemP256HkdfSha256:
				this._alg = {
					name: "ECDH",
					namedCurve: "P-256"
				}, this._nPk = 65, this._nSk = 32, this._nDh = 32, this._order = I, this._bitmask = 255, this._pkcs8AlgId = z, this._curveParams = _e;
				break;
			case b.DhkemP384HkdfSha384:
				this._alg = {
					name: "ECDH",
					namedCurve: "P-384"
				}, this._nPk = 97, this._nSk = 48, this._nDh = 48, this._order = L, this._bitmask = 255, this._pkcs8AlgId = he, this._curveParams = ve;
				break;
			default: this._alg = {
				name: "ECDH",
				namedCurve: "P-521"
			}, this._nPk = 133, this._nSk = 66, this._nDh = 66, this._order = R, this._bitmask = 1, this._pkcs8AlgId = ge, this._curveParams = ye;
		}
	}
	async serializePublicKey(e) {
		await this._setup();
		try {
			return await this._api.exportKey("raw", e);
		} catch (e) {
			throw new d(e);
		}
	}
	async deserializePublicKey(e) {
		await this._setup();
		try {
			return await this._importRawKey(E(e), !0);
		} catch (e) {
			throw new f(e);
		}
	}
	async serializePrivateKey(e) {
		await this._setup();
		try {
			let t = await this._api.exportKey("jwk", e);
			if (!("d" in t)) throw Error("Not private key");
			return ue(t.d).buffer;
		} catch (e) {
			throw new d(e);
		}
	}
	async deserializePrivateKey(e) {
		await this._setup();
		try {
			return await this._importRawKey(E(e), !1);
		} catch (e) {
			throw new f(e);
		}
	}
	async importKey(e, t, n) {
		await this._setup();
		try {
			if (e === "raw") return await this._importRawKey(t, n);
			if (t instanceof ArrayBuffer) throw Error("Invalid jwk key format");
			return await this._importJWK(t, n);
		} catch (e) {
			throw new f(e);
		}
	}
	async generateKeyPair() {
		await this._setup();
		try {
			return await this._api.generateKey(this._alg, !0, M);
		} catch (e) {
			throw new g(e);
		}
	}
	async deriveKeyPair(e) {
		await this._setup();
		try {
			let t = E(e), n = await this._hkdf.labeledExtract(C, N, new Uint8Array(t)), r = new P(this._nSk);
			for (let e = 0; r.isZero() || !r.lessThan(this._order); e++) {
				if (e > 255) throw Error("Faild to derive a key pair");
				let t = new Uint8Array(await this._hkdf.labeledExpand(n, F, k(e, 1), this._nSk));
				t[0] &= this._bitmask, r.set(t);
			}
			let i = await this._deserializePkcs8Key(r.val());
			return r.reset(), {
				privateKey: i,
				publicKey: await this.derivePublicKey(i)
			};
		} catch (e) {
			throw new re(e);
		}
	}
	async derivePublicKey(e) {
		await this._setup();
		try {
			let t = await this._api.exportKey("jwk", e);
			return delete t.d, delete t.key_ops, await this._api.importKey("jwk", t, this._alg, !0, []);
		} catch {
			try {
				return await this._derivePublicKeyWithoutJwkExport(e);
			} catch (e) {
				throw new f(e);
			}
		}
	}
	async dh(e, t) {
		try {
			return await this._setup(), await this._api.deriveBits({
				name: "ECDH",
				public: t
			}, e, this._nDh * 8);
		} catch (e) {
			throw new d(e);
		}
	}
	async _importRawKey(e, t) {
		if (t && e.byteLength !== this._nPk) throw Error("Invalid public key for the ciphersuite");
		if (!t && e.byteLength !== this._nSk) throw Error("Invalid private key for the ciphersuite");
		return t ? await this._api.importKey("raw", e, this._alg, !0, []) : await this._deserializePkcs8Key(new Uint8Array(e));
	}
	async _importJWK(e, t) {
		if (e.crv === void 0 || e.crv !== this._alg.namedCurve) throw Error(`Invalid crv: ${e.crv}`);
		if (t) {
			if (e.d !== void 0) throw Error("Invalid key: `d` should not be set");
			return await this._api.importKey("jwk", e, this._alg, !0, []);
		}
		if (e.d === void 0) throw Error("Invalid key: `d` not found");
		return await this._api.importKey("jwk", e, this._alg, !0, M);
	}
	async _deserializePkcs8Key(e) {
		let t = new Uint8Array(this._pkcs8AlgId.length + e.length);
		return t.set(this._pkcs8AlgId, 0), t.set(e, this._pkcs8AlgId.length), await this._api.importKey("pkcs8", t, this._alg, !0, M);
	}
	async _derivePublicKeyWithoutJwkExport(e) {
		let t = U(this._curveParams.gx, this._curveParams.gy, this._curveParams.coordinateSize), n = await this._api.importKey("raw", t.buffer, this._alg, !0, []), r = new Uint8Array(await this._api.deriveBits({
			name: "ECDH",
			public: n
		}, e, this._nDh * 8)), i = this._curveParams.p, a = xe(r), o = be(B(V(a, 3n, i) - 3n * a + this._curveParams.b, i), i);
		(o & 1n) == 1n && (o = i - o);
		let s = U(a, o, this._curveParams.coordinateSize);
		return await this._api.importKey("raw", s.buffer, this._alg, !0, []);
	}
}, Ce = ["encrypt", "decrypt"], we = class extends v {
	constructor(e) {
		super(), Object.defineProperty(this, "_rawKey", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), Object.defineProperty(this, "_key", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), this._rawKey = E(e);
	}
	async seal(e, t, n) {
		await this._setupKey();
		let r = {
			name: "AES-GCM",
			iv: E(e),
			additionalData: E(n)
		};
		return await this._api.encrypt(r, this._key, E(t));
	}
	async open(e, t, n) {
		await this._setupKey();
		let r = {
			name: "AES-GCM",
			iv: E(e),
			additionalData: E(n)
		};
		return await this._api.decrypt(r, this._key, E(t));
	}
	async _setupKey() {
		if (this._key !== void 0) return;
		await this._setup();
		let e = await this._importKey(this._rawKey);
		new Uint8Array(this._rawKey).fill(0), this._key = e;
	}
	async _importKey(e) {
		return await this._api.importKey("raw", e, { name: "AES-GCM" }, !0, Ce);
	}
}, Te = class {
	constructor() {
		Object.defineProperty(this, "id", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: S.Aes128Gcm
		}), Object.defineProperty(this, "keySize", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: 16
		}), Object.defineProperty(this, "nonceSize", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: 12
		}), Object.defineProperty(this, "tagSize", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: 16
		});
	}
	createEncryptionContext(e) {
		return new we(e);
	}
}, Ee = class extends Te {
	constructor() {
		super(...arguments), Object.defineProperty(this, "id", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: S.Aes256Gcm
		}), Object.defineProperty(this, "keySize", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: 32
		}), Object.defineProperty(this, "nonceSize", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: 12
		}), Object.defineProperty(this, "tagSize", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: 16
		});
	}
};
//#endregion
//#region ../../node_modules/.pnpm/@hpke+core@1.9.0/node_modules/@hpke/core/esm/src/utils/emitNotSupported.js
function W() {
	return new Promise((e, t) => {
		t(new g("Not supported"));
	});
}
//#endregion
//#region ../../node_modules/.pnpm/@hpke+core@1.9.0/node_modules/@hpke/core/esm/src/exporterContext.js
var De = new Uint8Array([
	115,
	101,
	99
]), G = class {
	constructor(e, t, n) {
		Object.defineProperty(this, "_api", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), Object.defineProperty(this, "exporterSecret", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), Object.defineProperty(this, "_kdf", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), this._api = e, this._kdf = t, this.exporterSecret = n;
	}
	async seal(e, t) {
		return await W();
	}
	async open(e, t) {
		return await W();
	}
	async export(e, t) {
		let n = E(e);
		if (n.byteLength > 8192) throw new u("Too long exporter context");
		try {
			return await this._kdf.labeledExpand(this.exporterSecret, De, new Uint8Array(n), t);
		} catch (e) {
			throw new h(e);
		}
	}
}, Oe = class extends G {}, ke = class extends G {
	constructor(e, t, n, r) {
		super(e, t, n), Object.defineProperty(this, "enc", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), this.enc = r;
	}
}, K = class extends G {
	constructor(e, t, n) {
		if (super(e, t, n.exporterSecret), Object.defineProperty(this, "_aead", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), Object.defineProperty(this, "_nK", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), Object.defineProperty(this, "_nN", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), Object.defineProperty(this, "_nT", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), Object.defineProperty(this, "_ctx", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), n.key === void 0 || n.baseNonce === void 0 || n.seq === void 0) throw Error("Required parameters are missing");
		this._aead = n.aead, this._nK = this._aead.keySize, this._nN = this._aead.nonceSize, this._nT = this._aead.tagSize;
		let r = this._aead.createEncryptionContext(n.key);
		this._ctx = {
			key: r,
			baseNonce: n.baseNonce,
			seq: n.seq
		};
	}
	computeNonce(e) {
		let t = k(e.seq, e.baseNonce.byteLength);
		return de(e.baseNonce, t).buffer;
	}
	incrementSeq(e) {
		if (e.seq > 2 ** 53 - 1) throw new ne("Message limit reached");
		e.seq += 1;
	}
}, Ae = function(e, t, n, r) {
	if (n === "a" && !r) throw TypeError("Private accessor was defined without a getter");
	if (typeof t == "function" ? e !== t || !r : !t.has(e)) throw TypeError("Cannot read private member from an object whose class did not declare it");
	return n === "m" ? r : n === "a" ? r.call(e) : r ? r.value : t.get(e);
}, je = function(e, t, n, r, i) {
	if (r === "m") throw TypeError("Private method is not writable");
	if (r === "a" && !i) throw TypeError("Private accessor was defined without a setter");
	if (typeof t == "function" ? e !== t || !i : !t.has(e)) throw TypeError("Cannot write private member to an object whose class did not declare it");
	return r === "a" ? i.call(e, n) : i ? i.value = n : t.set(e, n), n;
}, q, J = class {
	constructor() {
		q.set(this, Promise.resolve());
	}
	async lock() {
		let e, t = new Promise((t) => {
			e = t;
		}), n = Ae(this, q, "f");
		return je(this, q, t, "f"), await n, e;
	}
};
q = /* @__PURE__ */ new WeakMap();
//#endregion
//#region ../../node_modules/.pnpm/@hpke+core@1.9.0/node_modules/@hpke/core/esm/src/recipientContext.js
var Y = function(e, t, n, r) {
	if (n === "a" && !r) throw TypeError("Private accessor was defined without a getter");
	if (typeof t == "function" ? e !== t || !r : !t.has(e)) throw TypeError("Cannot read private member from an object whose class did not declare it");
	return n === "m" ? r : n === "a" ? r.call(e) : r ? r.value : t.get(e);
}, Me = function(e, t, n, r, i) {
	if (r === "m") throw TypeError("Private method is not writable");
	if (r === "a" && !i) throw TypeError("Private accessor was defined without a setter");
	if (typeof t == "function" ? e !== t || !i : !t.has(e)) throw TypeError("Cannot write private member to an object whose class did not declare it");
	return r === "a" ? i.call(e, n) : i ? i.value = n : t.set(e, n), n;
}, X, Ne = class extends K {
	constructor() {
		super(...arguments), X.set(this, void 0);
	}
	async open(e, t = C.buffer) {
		Me(this, X, Y(this, X, "f") ?? new J(), "f");
		let n = await Y(this, X, "f").lock(), r;
		try {
			r = await this._ctx.key.open(this.computeNonce(this._ctx), E(e), E(t));
		} catch (e) {
			throw new te(e);
		} finally {
			n();
		}
		return this.incrementSeq(this._ctx), r;
	}
};
X = /* @__PURE__ */ new WeakMap();
//#endregion
//#region ../../node_modules/.pnpm/@hpke+core@1.9.0/node_modules/@hpke/core/esm/src/senderContext.js
var Z = function(e, t, n, r) {
	if (n === "a" && !r) throw TypeError("Private accessor was defined without a getter");
	if (typeof t == "function" ? e !== t || !r : !t.has(e)) throw TypeError("Cannot read private member from an object whose class did not declare it");
	return n === "m" ? r : n === "a" ? r.call(e) : r ? r.value : t.get(e);
}, Pe = function(e, t, n, r, i) {
	if (r === "m") throw TypeError("Private method is not writable");
	if (r === "a" && !i) throw TypeError("Private accessor was defined without a setter");
	if (typeof t == "function" ? e !== t || !i : !t.has(e)) throw TypeError("Cannot write private member to an object whose class did not declare it");
	return r === "a" ? i.call(e, n) : i ? i.value = n : t.set(e, n), n;
}, Q, $ = class extends K {
	constructor(e, t, n, r) {
		super(e, t, n), Object.defineProperty(this, "enc", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), Q.set(this, void 0), this.enc = r;
	}
	async seal(e, t = C.buffer) {
		Pe(this, Q, Z(this, Q, "f") ?? new J(), "f");
		let n = await Z(this, Q, "f").lock(), r;
		try {
			r = await this._ctx.key.seal(this.computeNonce(this._ctx), E(e), E(t));
		} catch (e) {
			throw new ee(e);
		} finally {
			n();
		}
		return this.incrementSeq(this._ctx), r;
	}
};
Q = /* @__PURE__ */ new WeakMap();
//#endregion
//#region ../../node_modules/.pnpm/@hpke+core@1.9.0/node_modules/@hpke/core/esm/src/cipherSuiteNative.js
var Fe = new Uint8Array([
	98,
	97,
	115,
	101,
	95,
	110,
	111,
	110,
	99,
	101
]), Ie = new Uint8Array([
	101,
	120,
	112
]), Le = new Uint8Array([
	105,
	110,
	102,
	111,
	95,
	104,
	97,
	115,
	104
]), Re = new Uint8Array([
	107,
	101,
	121
]), ze = new Uint8Array([
	112,
	115,
	107,
	95,
	105,
	100,
	95,
	104,
	97,
	115,
	104
]), Be = new Uint8Array([
	115,
	101,
	99,
	114,
	101,
	116
]), Ve = new Uint8Array([
	72,
	80,
	75,
	69,
	0,
	0,
	0,
	0,
	0,
	0
]), He = class extends v {
	constructor(e) {
		if (super(), Object.defineProperty(this, "_kem", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), Object.defineProperty(this, "_kdf", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), Object.defineProperty(this, "_aead", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), Object.defineProperty(this, "_suiteId", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: void 0
		}), typeof e.kem == "number") throw new u("KemId cannot be used");
		if (this._kem = e.kem, typeof e.kdf == "number") throw new u("KdfId cannot be used");
		if (this._kdf = e.kdf, typeof e.aead == "number") throw new u("AeadId cannot be used");
		this._aead = e.aead, this._suiteId = new Uint8Array(Ve), this._suiteId.set(k(this._kem.id, 2), 4), this._suiteId.set(k(this._kdf.id, 2), 6), this._suiteId.set(k(this._aead.id, 2), 8), this._kdf.init(this._suiteId);
	}
	get kem() {
		return this._kem;
	}
	get kdf() {
		return this._kdf;
	}
	get aead() {
		return this._aead;
	}
	async createSenderContext(e) {
		this._validateInputLength(e), await this._setup();
		let t = await this._kem.encap(e), n;
		return n = e.psk === void 0 ? e.senderKey === void 0 ? y.Base : y.Auth : e.senderKey === void 0 ? y.Psk : y.AuthPsk, await this._keyScheduleS(n, t.sharedSecret, t.enc, e);
	}
	async createRecipientContext(e) {
		this._validateInputLength(e), await this._setup();
		let t = await this._kem.decap(e), n;
		return n = e.psk === void 0 ? e.senderPublicKey === void 0 ? y.Base : y.Auth : e.senderPublicKey === void 0 ? y.Psk : y.AuthPsk, await this._keyScheduleR(n, t, e);
	}
	async seal(e, t, n = C.buffer) {
		let r = await this.createSenderContext(e);
		return {
			ct: await r.seal(t, n),
			enc: r.enc
		};
	}
	async open(e, t, n = C.buffer) {
		return await (await this.createRecipientContext(e)).open(t, n);
	}
	async _keySchedule(e, t, n) {
		let r = n.psk === void 0 ? C : T(n.psk.id), i = await this._kdf.labeledExtract(C, ze, r), a = n.info === void 0 ? C : T(n.info), o = await this._kdf.labeledExtract(C, Le, a), s = new Uint8Array(1 + i.byteLength + o.byteLength);
		s.set(new Uint8Array([e]), 0), s.set(new Uint8Array(i), 1), s.set(new Uint8Array(o), 1 + i.byteLength);
		let c = n.psk === void 0 ? C : T(n.psk.key), l = this._kdf.buildLabeledIkm(Be, c), u = this._kdf.buildLabeledInfo(Ie, s, this._kdf.hashSize), d = await this._kdf.extractAndExpand(t, l, u, this._kdf.hashSize);
		if (this._aead.id === S.ExportOnly) return {
			aead: this._aead,
			exporterSecret: d
		};
		let f = this._kdf.buildLabeledInfo(Re, s, this._aead.keySize), p = await this._kdf.extractAndExpand(t, l, f, this._aead.keySize), m = this._kdf.buildLabeledInfo(Fe, s, this._aead.nonceSize), h = await this._kdf.extractAndExpand(t, l, m, this._aead.nonceSize);
		return {
			aead: this._aead,
			exporterSecret: d,
			key: p,
			baseNonce: new Uint8Array(h),
			seq: 0
		};
	}
	async _keyScheduleS(e, t, n, r) {
		let i = await this._keySchedule(e, t, r);
		return i.key === void 0 ? new ke(this._api, this._kdf, i.exporterSecret, n) : new $(this._api, this._kdf, i, n);
	}
	async _keyScheduleR(e, t, n) {
		let r = await this._keySchedule(e, t, n);
		return r.key === void 0 ? new Oe(this._api, this._kdf, r.exporterSecret) : new Ne(this._api, this._kdf, r);
	}
	_validateInputLength(e) {
		if (e.info !== void 0 && e.info.byteLength > 268435456) throw new u("Too long info");
		if (e.psk !== void 0) {
			if (e.psk.key.byteLength < 32) throw new u("PSK must have at least 32 bytes");
			if (e.psk.key.byteLength > 8192) throw new u("Too long psk.key");
			if (e.psk.id.byteLength > 8192) throw new u("Too long psk.id");
		}
	}
}, Ue = class extends j {
	constructor() {
		let e = new D(), t = new Se(b.DhkemP256HkdfSha256, e);
		super(b.DhkemP256HkdfSha256, t, e), Object.defineProperty(this, "id", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: b.DhkemP256HkdfSha256
		}), Object.defineProperty(this, "secretSize", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: 32
		}), Object.defineProperty(this, "encSize", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: 65
		}), Object.defineProperty(this, "publicKeySize", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: 65
		}), Object.defineProperty(this, "privateKeySize", {
			enumerable: !0,
			configurable: !0,
			writable: !0,
			value: 32
		});
	}
}, We = class extends He {}, Ge = class extends Ue {}, Ke = class extends D {};
//#endregion
export { Ee as Aes256Gcm, We as CipherSuite, Ge as DhkemP256HkdfSha256, Ke as HkdfSha256 };
