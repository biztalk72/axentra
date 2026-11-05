# Cloudflare Pages 배포

하나의 정적 Pages 프로젝트에 브랜드 소개 `/`와 제품 데모 `/demo.html`을 함께 배포한다. Cloudflare가 HTML 확장자를 정규화하면 `/demo`로 이동할 수 있다. 소개의 모든 체험 버튼은 상대 경로를 사용하므로 해당 Cloudflare 사이트의 데모로 연결되며 선택 언어도 유지된다. 한국어·English가 모두 포함된다.

## 배포 완료 (2026-11-05)

- 소개: https://axentra-5u6.pages.dev/
- 데모: https://axentra-5u6.pages.dev/demo
- English: https://axentra-5u6.pages.dev/?lang=en
- 프로젝트: `axentra`, production branch: `main`
- 배포 ID: `eb42e104-bcae-470b-878a-d4a1dcd01c85`, 빌드 소스: `abbc096`

Wrangler 업로드·production 배포 성공 후 curl로 소개·영문 데모 경로의 HTTP 성공, 진입 JS/CSS 5개와 파비콘 3종의 해시가 최종 로컬 빌드와 일치함을 확인했다. Pages가 `/demo.html`을 `/demo`로 정규화한다. 새 계정 연결은 Pages 편집 권한만으로 수행했으며 Workers 권한을 추가하지 않았다.

## 빌드와 업로드

```bash
npm --prefix frontend ci
# 최초 1회, 본인의 Cloudflare 계정으로 브라우저 인증
npx --yes wrangler@4.157.0 login
# 기본 프로젝트명 axentra, 다른 이름은 인자로 지정
./scripts/deploy-cloudflare.sh axentra
```

아직 프로젝트가 없으면 `npx --yes wrangler@4.157.0 pages project create axentra --production-branch main --force`로 생성한다. `--force`는 이 버전의 Workers 위임을 우회하고 기존 Pages API를 직접 사용하기 위한 옵션이며, 기존 데이터를 삭제하거나 덮어쓰는 옵션이 아니다. 이미 생성된 프로젝트의 후속 배포에는 `--force`를 사용하지 않는다. 계정에 여러 프로젝트가 있으면 기존 프로젝트와 혼동하지 않도록 이름을 확인한다. 반환된 production URL을 배포 주소로 사용한다. 타 계정이 `axentra.pages.dev`를 사용 중이면 다른 사용 가능한 프로젝트명을 선택해야 한다.

자동화는 외부에서 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`를 주입할 수 있다. 토큰은 해당 계정의 Cloudflare Pages 편집 범위로 제한하고 저장소나 빌드 결과에 넣지 않는다. 브라우저 체험 빌드에는 API·DB·관리자 서버 환경 파일이 포함되지 않는다. `frontend/public/_headers`에서 HTML 재검증, 해시 자산 장기 캐시와 기본 응답 헤더를 설정한다.

## 배포 후 확인

- `/`: Axentra 소개, 제품 탭 4종, 리소스와 FAQ.
- `/?lang=en`: English 소개와 영문 데모 링크.
- `/demo.html`: Axentra 로그인, 일반 계정 직접 생성, 언어 유지.
- `/demo.html#panel-view`: 로그인 후 현장 패널 뷰.
- favicon.svg/ICO/Apple icon과 정적 JS/CSS의 HTTP 200.

이 배포는 합성 데이터를 사용하는 공개 브라우저 체험이다. 실제 FastAPI·PostgreSQL 백엔드는 [Docker 배포](DEPLOYMENT.md)로 제공한다. Pages 정적 업로드만으로 실제 공장 서버나 데이터베이스가 외부에 공개되지 않는다. Cloudflare와 GitHub Pages는 서로 다른 origin이므로 체험 계정·저장 데이터는 각각의 브라우저 origin에 보관된다.

참조: [Cloudflare Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/), [Wrangler Pages commands](https://developers.cloudflare.com/workers/wrangler/commands/pages/).
