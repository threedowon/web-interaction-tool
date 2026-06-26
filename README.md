# 3D Interaction Tool

인터랙티브한 3D 모델링 웹 인터페이스입니다. 이미지에서 영감을 받아 제작되었습니다.

## 기능

- **3D 객체 조작**: 마우스로 3D 객체를 회전시킬 수 있습니다
- **다양한 형태**: Cube, Sphere, Cone, Cylinder, Torus 등 다양한 3D 형태 생성
- **도구 선택**: Render, Rotation, Texture, Polygons, Points, Intrude 등 다양한 도구
- **조명 제어**: Spot, Area, Target, Sun 등 4가지 조명 타입
- **밝기 조절**: Brightness 슬라이더로 조명 밝기 조절
- **그림자 밀도**: Shadow Density 슬라이더로 그림자 조절

## 사용 방법

1. `index.html` 파일을 브라우저에서 엽니다
2. 왼쪽 사이드바에서 원하는 형태(Forms)를 선택합니다
3. 도구(Tools)를 선택하여 작업 모드를 변경합니다
4. 오른쪽 사이드바에서 조명(Lightning) 타입을 선택하고 밝기를 조절합니다
5. 캔버스에서 마우스를 드래그하여 3D 객체를 회전시킵니다

## 기술 스택

- HTML5
- CSS3
- JavaScript
- Three.js (3D 렌더링)

## 브라우저 호환성

모던 브라우저(Chrome, Firefox, Safari, Edge)에서 작동합니다.

---

## Book Gesture Bridge (`book-gesture.html`)

휴대폰 카메라로 책을 비추면 MediaPipe Hands로 손 동작을 인식해서, 다음 세 가지 동작을 WebSocket으로 언리얼 엔진에 전송하는 도구입니다.

- **page_turn**: 손바닥을 펼친 채 좌/우로 빠르게 스윕
- **underline**: 검지만 펴고 가로로 일직선으로 이동 (밑줄 긋는 동작)
- **bookmark_fold**: 엄지와 검지를 핀치한 상태로 잠시 유지 (책갈피 접기)

손가락 모양/이동 패턴 기반 휴리스틱으로 판별하며, 우측 패널의 슬라이더로 각 동작의 감도를 조절할 수 있습니다.

### 사용 방법

1. `book-gesture.html`을 HTTPS로 서빙한 뒤 휴대폰 브라우저로 접속합니다.
2. "카메라 시작"을 눌러 카메라 권한을 허용합니다. (기본은 후면 카메라)
3. Unreal WebSocket 서버 주소를 입력하고 "연결"을 누릅니다.
4. 책 위에서 손 동작을 취하면 감지 로그에 표시되고, 연결되어 있으면 즉시 Unreal로 전송됩니다.

### WebSocket 메시지 형식

```json
{ "type": "book_gesture", "event": "page_turn", "direction": "left", "timestamp": 1719400000000 }
{ "type": "book_gesture", "event": "underline", "direction": "right", "timestamp": 1719400000000 }
{ "type": "book_gesture", "event": "bookmark_fold", "timestamp": 1719400000000 }
```

Unreal 측에서는 WebSocket 서버(플러그인 등)를 열어두고 위 JSON을 파싱해서 원하는 액션에 매핑하면 됩니다.

### 주의사항

- `getUserMedia`(카메라 접근)는 **보안 컨텍스트**(HTTPS 또는 `localhost`)에서만 동작합니다. 휴대폰에서 PC의 사설 IP(`http://192.168.x.x`)로 접속하면 카메라 권한 요청 자체가 차단됩니다. `mkcert` 등으로 로컬 인증서를 만들거나 ngrok/Cloudflare Tunnel 같은 HTTPS 터널을 사용하세요.
- 페이지를 HTTPS로 서빙하면, 같은 페이지에서 `ws://`(비암호화) 주소로의 WebSocket 연결은 브라우저의 mixed-content 정책에 의해 차단될 수 있습니다. Unreal WebSocket 서버도 `wss://`(TLS)로 열거나, TLS를 종료해주는 리버스 프록시를 앞에 두는 것을 권장합니다.
- MediaPipe Hands는 CDN(jsdelivr)에서 로드하므로 휴대폰이 인터넷에 연결되어 있어야 합니다.