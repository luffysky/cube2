/* 轉磚 where a member's own files live: their pictures (shop.js) and music (music.js).

   For now everything stays on this device (IndexedDB). The player picks, per kind, whether to keep it only here or
   also upload it to their cloud space; the upload choice is shown but switched off until the file storage (R2) is
   connected, so nothing is ever sent today. Whatever they pick, the sheet says plainly what "only on this device"
   means: it survives closing the browser, but not clearing the site's data, a private window, another device, or
   (on iPhone Safari) a week without opening the game. We also ask the browser to keep the data for good. */
(function () {
  'use strict';
  var ZZ = window.ZZ, App = ZZ.App, L = ZZ.L, t = L.t;
  var KEY = 'zhuanzhuan.upload.v1';
  // on once the server says uploads work (R2 keys set) and this device has a cloud save to keep them with
  function ready() { var C = ZZ.Cloud; return !!(C && C.files && C.hosted && C.hosted()); }

  L.add({
    'ds.where': ['存在哪裡', 'Where they are kept', '保存場所', '저장 위치'],
    'ds.local': ['只存這台裝置', 'This device only', 'この端末だけ', '이 기기에만'],
    'ds.cloud': ['也上傳到雲端', 'Also upload to the cloud', 'クラウドにも保存', '클라우드에도 업로드'],
    'ds.soon': ['雲端上傳準備中，現在全部只存在這台裝置。', 'Cloud upload is on its way; for now everything stays on this device.', 'クラウド保存は準備中です。今はすべてこの端末にだけ保存されます。', '클라우드 업로드는 준비 중이에요. 지금은 모두 이 기기에만 저장돼요.'],
    'ds.localP': ['只存在這台裝置：關掉瀏覽器、重開機都還在；但清除網站資料、用無痕視窗、換手機或電腦就不會有。iPhone 的 Safari 超過 7 天沒打開遊戲，也可能被系統清掉。', 'On this device only: they stay after closing the browser or restarting, but not after clearing the site\'s data, in a private window, or on another phone or computer. On iPhone Safari, a week without opening the game can also clear them.', 'この端末だけに保存：ブラウザを閉じても再起動しても残りますが、サイトデータの削除、プライベートウィンドウ、別の端末では使えません。iPhone の Safari では7日間ゲームを開かないと消えることもあります。', '이 기기에만 저장: 브라우저를 닫거나 재부팅해도 남지만, 사이트 데이터를 지우거나 시크릿 창, 다른 기기에서는 없어요. iPhone Safari에서는 7일 동안 게임을 열지 않으면 지워질 수도 있어요.'],
    'ds.cloudP': ['新加入的檔案會另外上傳到你的雲端空間；這台裝置上原本就有的，可以按「上傳到雲端」補傳。換裝置後在這裡按「從雲端取回」。只有你自己看得到。', 'New files are also uploaded to your cloud space; the ones already on this device can be sent with "Upload to the cloud". On another device, use "Get from the cloud" here. Only you can see them.', '新しく追加したファイルはクラウドにも保存されます。この端末に前からあるものは「クラウドに保存」で送れます。別の端末ではここで「クラウドから取得」を押してください。見られるのはあなただけです。', '새로 넣은 파일은 클라우드에도 올라가요. 이 기기에 원래 있던 파일은 "클라우드에 업로드"로 올릴 수 있어요. 다른 기기에서는 여기서 "클라우드에서 가져오기"를 누르세요. 나만 볼 수 있어요.'],
    'ds.pull': ['從雲端取回', 'Get from the cloud', 'クラウドから取得', '클라우드에서 가져오기'],
    'ds.pulled': ['從雲端取回 {0} 個檔案', 'Got {0} files from the cloud', 'クラウドから {0} 件取得', '클라우드에서 {0}개 가져옴'],
    'ds.upFail': ['上傳到雲端沒有成功，檔案還在這台裝置上。', 'The upload did not go through; the file is still on this device.', 'アップロードできませんでした。ファイルはこの端末に残っています。', '업로드하지 못했어요. 파일은 이 기기에 남아 있어요.'],
    'ds.kept': ['瀏覽器已同意長期保存這些檔案。', 'The browser has agreed to keep these for good.', 'ブラウザがこれらを長期保存することに同意しました。', '브라우저가 이 파일들을 오래 보관하기로 했어요.'],
    'ds.lock': ['上傳前先加密', 'Locked before upload', 'アップロード前に暗号化', '업로드 전에 암호화'],
    'ds.lockS': ['金鑰由轉磚保管', 'Key kept by 轉磚', '鍵は轉磚が保管', '키는 轉磚가 보관'],
    'ds.lockP': ['用我自己的密碼', 'My own password', '自分のパスワード', '내 비밀번호'],
    'ds.lockSP': ['檔案在你的瀏覽器裡先加密才上傳。金鑰放在轉磚的伺服器，不和檔案放一起：雲端空間的檔案就算外流也打不開；換裝置照常取回。', 'Files are locked in your browser before they are uploaded. The key is kept on 轉磚\'s server, apart from the files: even if the cloud copies leaked they could not be opened, and another device gets them back as usual.', 'ファイルはブラウザで暗号化してからアップロードします。鍵は轉磚のサーバーにファイルとは別に保管します。クラウドの分が流出しても開けず、別の端末ではいつもどおり取り戻せます。', '파일은 브라우저에서 먼저 암호화한 뒤 올라가요. 키는 파일과 따로 轉磚 서버에 보관해요. 클라우드 사본이 유출돼도 열 수 없고, 다른 기기에서는 평소처럼 되찾을 수 있어요.'],
    'ds.lockPP': ['用只有你知道的密碼加密，連轉磚也打不開。換裝置取回時要輸入密碼。忘記密碼可以用設定時給你的救援碼重設；記得密碼時也能隨時產生新的救援碼。救援碼可以選擇留信箱讓我們代為保管（會在畫面上先說明）。密碼和救援碼都不見的話，雲端的檔案就再也打不開。', 'Locked with a password only you know; not even 轉磚 can open them. You enter it to get them back on another device. If you forget it, the recovery code you were given resets it, and while you know the password you can make a new code at any time. You may choose to leave an email address so we keep the code for you (explained on screen first). With both lost, the cloud copies can never be opened.', 'あなただけが知るパスワードで暗号化し、轉磚でも開けません。別の端末で取り戻すときに入力します。忘れたら設定時の回復コードで再設定でき、パスワードがわかるうちはいつでも新しいコードを作れます。メールアドレスを登録してコードを預けることもできます（先に画面で説明します）。両方なくすと、クラウドの分は二度と開けません。', '나만 아는 비밀번호로 암호화해서 轉磚도 열 수 없어요. 다른 기기에서 되찾을 때 입력해요. 잊으면 설정할 때 받은 복구 코드로 다시 정할 수 있고, 비밀번호를 아는 동안은 언제든 새 코드를 만들 수 있어요. 이메일을 남겨 코드를 맡길 수도 있어요(먼저 화면에서 설명해요). 둘 다 잃으면 클라우드 파일은 다시는 열 수 없어요.'],
    'ds.lockPOld': ['已經上傳的檔案維持原本的加密方式；之後新上傳的才用新的方式。', 'Files already uploaded keep the way they were locked; new uploads use the new way.', 'すでにアップロードしたファイルは元の方式のままで、新しいものから新しい方式になります。', '이미 올린 파일은 원래 방식 그대로이고, 새로 올리는 것부터 새 방식을 써요.'],
    'vt.newCode': ['產生新的救援碼', 'Make a new recovery code', '新しい回復コードを作る', '새 복구 코드 만들기'],
    'vt.newCodeP': ['舊的救援碼會失效，換成新的這組。', 'The old recovery code stops working; this new one replaces it.', '古い回復コードは使えなくなり、新しいものに置き換わります。', '이전 복구 코드는 더 이상 쓸 수 없고 새 코드로 바뀌어요.'],
    'vt.mailTitle': ['用信箱保管救援碼（選填）', 'Keep the recovery code with your email (optional)', 'メールで回復コードを保管（任意）', '이메일로 복구 코드 보관 (선택)'],
    'vt.mailP': ['如果怕救援碼弄丟，可以留一個信箱。用途只有一個：你之後按「把救援碼寄到我的信箱」時，把這組救援碼寄給你。不會寄廣告，也不會給別人。要先收驗證碼確認是你的信箱。', 'If you might lose the code, you can leave an email address. It has one use: when you later press "Mail me my recovery code", the code is sent there. No ads, never shared. You confirm it is yours with a code we mail first.', '回復コードをなくしそうなら、メールアドレスを登録できます。用途は一つだけで、あとで「回復コードをメールで送る」を押したときにこのコードを送ります。広告は送らず、第三者にも渡しません。まず確認コードで本人のアドレスか確かめます。', '복구 코드를 잃어버릴까 걱정되면 이메일을 남길 수 있어요. 용도는 하나뿐이에요: 나중에 "복구 코드를 메일로 받기"를 누르면 이 코드를 보내요. 광고를 보내지 않고 남에게 주지 않아요. 먼저 확인 코드로 내 이메일인지 확인해요.'],
    'vt.mailWarn': ['留了信箱的話，轉磚會加密保管一份救援碼，所以技術上轉磚也拿得到它；不留信箱就只有你自己能打開。', 'With an address, 轉磚 keeps a locked copy of the recovery code, so 轉磚 could technically get it; without one, only you can open your files.', 'アドレスを登録すると、轉磚が回復コードの暗号化コピーを保管するため、技術的には轉磚も取得できます。登録しなければ開けるのはあなただけです。', '이메일을 남기면 轉磚가 복구 코드의 암호화 사본을 보관해서, 기술적으로는 轉磚도 그 코드를 얻을 수 있어요. 남기지 않으면 나만 열 수 있어요.'],
    'vt.mailLater': ['之後綁定 SnowRealm Games 帳號時，會改用帳號的信箱。', 'Once you link a SnowRealm Games account, its address can take this place.', 'SnowRealm Games アカウントと連携すると、そのアドレスに切り替わります。', 'SnowRealm Games 계정을 연결하면 그 계정의 이메일로 바뀌어요.'],
    'vt.mailNotReady': ['寄信服務準備中，這個選項暫時不能用。', 'The mail service is not ready yet, so this option is not available for now.', 'メール送信の準備中のため、今は使えません。', '메일 서비스를 준비 중이라 지금은 쓸 수 없어요.'],
    'vt.mailKids': ['13 歲以下不提供信箱保管。', 'Not offered to players under 13.', '13歳未満の方には提供していません。', '13세 미만에게는 제공하지 않아요.'],
    'vt.email': ['信箱', 'Email', 'メールアドレス', '이메일'],
    'vt.sendPin': ['寄驗證碼', 'Send code', '確認コードを送る', '확인 코드 보내기'],
    'vt.skip': ['不用了', 'No thanks', '使わない', '괜찮아요'],
    'vt.pinTitle': ['輸入驗證碼', 'Enter the code', '確認コードを入力', '확인 코드 입력'],
    'vt.pinP': ['驗證碼已寄到 {0}，15 分鐘內有效。', 'A code was sent to {0}; it lasts 15 minutes.', '{0} に確認コードを送りました。15分間有効です。', '{0}(으)로 확인 코드를 보냈어요. 15분 동안 유효해요.'],
    'vt.pin': ['6 位數驗證碼', '6-digit code', '6桁の確認コード', '6자리 확인 코드'],
    'vt.resend': ['重寄', 'Send again', '再送', '다시 보내기'],
    'vt.mailKept': ['好了，救援碼已用 {0} 保管。', 'Done. The recovery code is kept with {0}.', '完了。回復コードを {0} で保管しました。', '완료. 복구 코드를 {0}(으)로 보관했어요.'],
    'vt.badEmail': ['信箱格式不對。', 'That email address does not look right.', 'メールアドレスの形式が正しくありません。', '이메일 형식이 맞지 않아요.'],
    'vt.badPin': ['驗證碼不對。', 'That code is not right.', '確認コードが違います。', '확인 코드가 틀려요.'],
    'vt.pinGone': ['驗證碼過期或試太多次了，請重寄一封。', 'The code has run out or was tried too often; send a new one.', 'コードの期限切れか試行回数超過です。もう一度送ってください。', '코드가 만료됐거나 너무 많이 시도했어요. 다시 보내세요.'],
    'vt.slowMail': ['寄太多次了，等一小時再試。', 'Too many mails; try again in an hour.', '送信回数が多すぎます。1時間後にお試しください。', '너무 많이 보냈어요. 한 시간 뒤에 다시 해 보세요.'],
    'vt.remind': ['把救援碼寄到我的信箱', 'Mail me my recovery code', '回復コードをメールで送る', '복구 코드를 메일로 받기'],
    'vt.reminded': ['救援碼已寄到 {0}。', 'The recovery code was sent to {0}.', '回復コードを {0} に送りました。', '복구 코드를 {0}(으)로 보냈어요.'],
    'vt.mailFail': ['信沒有寄出去，稍後再試。', 'The mail did not go out; try again later.', 'メールを送れませんでした。後でお試しください。', '메일을 보내지 못했어요. 나중에 다시 해 보세요.'],
    'vt.ok': ['確定', 'OK', 'OK', '확인'],
    'ds.how': ['我們怎麼保護你的檔案', 'How we protect your files', 'ファイルの守り方', '파일을 지키는 방법'],
    'ds.how1': ['先加密再上傳：檔案在你自己的瀏覽器裡用 AES-256-GCM（銀行和通訊軟體常用的加密標準）加密，離開你的裝置時已經是一堆看不懂的資料。', 'Locked before it leaves: each file is encrypted in your own browser with AES-256-GCM (the standard banks and messaging apps use), so what leaves your device is already unreadable.', '送る前に暗号化：ファイルはあなたのブラウザで AES-256-GCM（銀行やメッセージアプリでも使われる標準）で暗号化され、端末を出るときにはもう読めないデータです。', '보내기 전에 암호화: 파일은 내 브라우저에서 AES-256-GCM(은행과 메신저가 쓰는 표준)으로 암호화돼서, 기기를 떠날 때 이미 읽을 수 없는 데이터예요.'],
    'ds.how2': ['一個檔案一把鑰匙：每個檔案都有自己的隨機金鑰，就算有一把出事，其他檔案也不受影響。', 'One key per file: every file has its own random key, so one problem never opens the rest.', '1ファイルに1つの鍵：ファイルごとに別のランダムな鍵を使うので、1つに問題があってもほかは開けません。', '파일마다 다른 키: 파일마다 무작위 키를 따로 써서, 하나에 문제가 생겨도 나머지는 열리지 않아요.'],
    'ds.how3': ['鑰匙和檔案分開放：檔案存在 Cloudflare R2，鑰匙存在轉磚自己的資料庫。只拿到其中一邊什麼都打不開。傳輸全程走 HTTPS，R2 本身也會再加密一層。', 'Keys and files apart: files are in Cloudflare R2, keys in 轉磚\'s own database; one without the other opens nothing. Everything travels over HTTPS, and R2 adds its own encryption at rest.', '鍵とファイルは別々に：ファイルは Cloudflare R2、鍵は轉磚のデータベースにあり、片方だけでは開けません。通信はすべて HTTPS で、R2 自体も保存時に暗号化します。', '키와 파일은 따로: 파일은 Cloudflare R2에, 키는 轉磚 데이터베이스에 있어서 한쪽만으로는 열 수 없어요. 전송은 모두 HTTPS이고 R2도 저장할 때 한 번 더 암호화해요.'],
    'ds.how4': ['只有你：只有登入你這份存檔的裝置拿得到下載網址，網址一小時就失效。我們不看、不分析、不分享你的檔案。', 'Only you: only devices on your save can get a download address, and it expires within an hour. We do not look at, analyse or share your files.', 'あなただけ：ダウンロード用のアドレスはあなたのセーブの端末だけが受け取れ、1時間で無効になります。ファイルを見たり分析したり共有したりしません。', '나만: 다운로드 주소는 내 저장 데이터의 기기만 받을 수 있고 1시간이면 만료돼요. 파일을 보거나 분석하거나 공유하지 않아요.'],
    'ds.how5': ['想更保險：選「用我自己的密碼」，鑰匙改由你的密碼鎖住（PBKDF2 運算 60 萬次，很難猜），密碼不會傳到我們這裡，連轉磚也打不開。忘記密碼用救援碼重設。救援碼可以選擇留信箱讓轉磚加密代管，代管的話轉磚技術上也拿得到；不留就只有你自己能開。', 'Even safer: choose "My own password" and the key is locked with your password (PBKDF2, 600,000 rounds, very hard to guess). The password never reaches us, so not even 轉磚 can open the files. If you forget it, use the recovery code. You may let 轉磚 keep a locked copy of the code with your email; then 轉磚 could technically get it, and without that only you can open them.', 'さらに安全に：「自分のパスワード」を選ぶと、鍵はあなたのパスワード（PBKDF2 60万回、推測は困難）で守られます。パスワードはこちらに届かないので、轉磚でも開けません。忘れたら回復コードで再設定。回復コードはメールアドレスを登録して轉磚に暗号化保管させることもでき、その場合は技術的に轉磚も取得できます。登録しなければ開けるのはあなただけです。', '더 안전하게: "내 비밀번호"를 고르면 키가 내 비밀번호(PBKDF2 60만 번, 추측이 매우 어려움)로 잠겨요. 비밀번호는 저희에게 오지 않아서 轉磚도 열 수 없어요. 잊으면 복구 코드로 다시 정해요. 복구 코드는 이메일을 남겨 轉磚에 암호화 보관을 맡길 수 있고, 그러면 기술적으로 轉磚도 얻을 수 있어요. 남기지 않으면 나만 열 수 있어요.'],
    'ds.pwChange': ['換密碼', 'Change password', 'パスワードを変更', '비밀번호 변경'],
    'vt.setTitle': ['設定加密密碼', 'Set a password', 'パスワードを設定', '비밀번호 설정'],
    'vt.setP': ['至少 8 個字。這個密碼不會傳到伺服器，我們也查不到、救不回。', 'At least 8 characters. It never goes to the server; we cannot look it up or get it back.', '8文字以上。サーバーには送られず、こちらでも調べたり戻したりできません。', '8자 이상. 서버로 보내지 않아서 저희도 찾거나 되돌릴 수 없어요.'],
    'vt.pw': ['密碼', 'Password', 'パスワード', '비밀번호'],
    'vt.pw2': ['再輸入一次', 'Again', 'もう一度', '한 번 더'],
    'vt.old': ['目前的密碼', 'Current password', '現在のパスワード', '현재 비밀번호'],
    'vt.new': ['新密碼', 'New password', '新しいパスワード', '새 비밀번호'],
    'vt.short': ['密碼至少要 8 個字。', 'The password needs at least 8 characters.', 'パスワードは8文字以上にしてください。', '비밀번호는 8자 이상이어야 해요.'],
    'vt.diff': ['兩次輸入的密碼不一樣。', 'The two passwords are not the same.', '2つのパスワードが一致しません。', '두 비밀번호가 달라요.'],
    'vt.codeTitle': ['你的救援碼', 'Your recovery code', '回復コード', '복구 코드'],
    'vt.codeP': ['忘記密碼時用這組救援碼重設。只會顯示這一次，請抄下來或截圖，放在別人拿不到的地方。', 'Use this code to reset the password if you forget it. It is shown only now: write it down or take a picture and keep it where others cannot get it.', 'パスワードを忘れたらこのコードで再設定します。表示は今回だけです。書き留めるか撮影して、他人に見られない場所に保管してください。', '비밀번호를 잊으면 이 코드로 다시 정해요. 지금만 보여요. 적어 두거나 사진을 찍어 남이 못 보는 곳에 보관하세요.'],
    'vt.codeOk': ['我抄好了', 'I have saved it', '控えました', '저장했어요'],
    'vt.askTitle': ['輸入加密密碼', 'Enter your password', 'パスワードを入力', '비밀번호 입력'],
    'vt.askP': ['需要你的密碼才能加密或打開雲端的檔案。這次開著遊戲的期間只問一次。', 'Your password is needed to lock or open your cloud files. You are asked once while the game stays open.', 'クラウドのファイルを暗号化・復号するにはパスワードが必要です。ゲームを開いている間は一度だけ聞きます。', '클라우드 파일을 암호화하거나 열려면 비밀번호가 필요해요. 게임을 켜 둔 동안 한 번만 물어봐요.'],
    'vt.wrong': ['密碼不對。', 'That password is not right.', 'パスワードが違います。', '비밀번호가 틀려요.'],
    'vt.forgot': ['忘記密碼？用救援碼', 'Forgot it? Use the recovery code', '忘れた？回復コードを使う', '잊었나요? 복구 코드 사용'],
    'vt.recTitle': ['用救援碼重設密碼', 'Reset with the recovery code', '回復コードで再設定', '복구 코드로 다시 설정'],
    'vt.code': ['救援碼', 'Recovery code', '回復コード', '복구 코드'],
    'vt.badCode': ['救援碼不對。', 'That recovery code is not right.', '回復コードが違います。', '복구 코드가 틀려요.'],
    'vt.done': ['好了，新密碼生效了。', 'Done. The new password works now.', '完了しました。新しいパスワードが有効です。', '완료. 새 비밀번호가 적용됐어요.'],
    'vt.fail': ['沒有成功，稍後再試一次。', 'That did not work; try again in a moment.', 'うまくいきませんでした。少ししてからお試しください。', '되지 않았어요. 잠시 후 다시 해 보세요.'],
    'vt.busy': ['處理中…（加密要花幾秒）', 'Working… (this takes a few seconds)', '処理中…（数秒かかります）', '처리 중… (몇 초 걸려요)'],
    'ds.trash': ['最近移除', 'Recently removed', '最近削除した項目', '최근 삭제'],
    'ds.trashP': ['從雲端移除的檔案會在這裡留 30 天，期間可以復原；之後就真的刪除了。', 'Files taken off the cloud wait here for 30 days and can be brought back; after that they are deleted.', 'クラウドから外したファイルはここに30日間残り、元に戻せます。その後は削除されます。', '클라우드에서 뺀 파일은 여기 30일 동안 남아 되돌릴 수 있어요. 그 뒤에는 삭제돼요.'],
    'ds.trashNone': ['30 天內沒有移除過的檔案。', 'Nothing removed in the last 30 days.', '30日以内に削除したファイルはありません。', '30일 안에 삭제한 파일이 없어요.'],
    'ds.left': ['還剩 {0} 天', '{0} days left', '残り{0}日', '{0}일 남음'],
    'ds.back': ['復原', 'Bring back', '元に戻す', '되돌리기'],
    'ds.backOk': ['已復原，正在取回這台裝置。', 'Brought back; getting it onto this device.', '元に戻しました。この端末に取得しています。', '되돌렸어요. 이 기기로 가져오는 중이에요.'],
    'ds.backFull': ['雲端空間滿了，先移除別的檔案再復原。', 'Your cloud space is full; remove something else first.', 'クラウドの容量がいっぱいです。先に別のファイルを削除してください。', '클라우드 공간이 꽉 찼어요. 다른 파일을 먼저 지워 주세요.'],
    'ds.backFail': ['復原沒有成功，稍後再試一次。', 'That did not work; try again in a moment.', '元に戻せませんでした。少ししてからもう一度お試しください。', '되돌리지 못했어요. 잠시 후 다시 해 보세요.'],
    'ds.notKept': ['瀏覽器沒有答應長期保存，空間不夠時可能先被清掉。', 'The browser did not promise to keep them; it may clear them when space runs low.', 'ブラウザは長期保存を約束していません。空き容量が少ないと消えることがあります。', '브라우저가 오래 보관하겠다고 하지 않았어요. 공간이 부족하면 지워질 수 있어요.']
  });

  var st = { pics: 'local', music: 'local', lock: 's' }, kept = null;
  try { var v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v) { if (v.pics === 'cloud') st.pics = 'cloud'; if (v.music === 'cloud') st.music = 'cloud'; if (v.lock === 'p') st.lock = 'p'; } } catch (e) { /* first visit */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* storage off */ } }

  // ask once to keep the files; the answer is shown in the note
  function persist() {
    var s = navigator.storage;
    if (!s || !s.persist) return;
    (s.persisted ? s.persisted() : Promise.resolve(false)).then(function (yes) {
      if (yes) { kept = true; return; }
      return s.persist().then(function (ok) { kept = !!ok; });
    }).then(null, function () { kept = false; });
  }
  if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then(function (yes) { kept = yes; }, function () {});

  // the choice and the note, for a sheet; kind: 'pics' or 'music'
  function html(kind) {
    var cur = ready() ? st[kind] : 'local', h = '<h3>' + t('ds.where') + '</h3><div class="seg" role="radiogroup" aria-label="' + App.esc(t('ds.where')) + '">';
    ['local', 'cloud'].forEach(function (w) {
      h += '<button type="button" role="radio" aria-checked="' + (cur === w) + '" data-dswhere="' + kind + ':' + w + '"' + (w === 'cloud' && !ready() ? ' disabled' : '') + '>' + t('ds.' + w) + '</button>';
    });
    h += '</div>';
    if (!ready()) h += '<p class="note">' + t('ds.soon') + '</p>';
    if (cur === 'cloud') {
      h += '<p class="note">' + t('ds.cloudP') + '</p>';
      h += '<h3>' + t('ds.lock') + '</h3><div class="seg" role="radiogroup" aria-label="' + App.esc(t('ds.lock')) + '">' + ['s', 'p'].map(function (m) {
        return '<button type="button" role="radio" aria-checked="' + (st.lock === m) + '" data-dslock="' + m + '">' + t(m === 's' ? 'ds.lockS' : 'ds.lockP') + '</button>';
      }).join('') + '</div><p class="note">' + t(st.lock === 'p' ? 'ds.lockPP' : 'ds.lockSP') + ' ' + t('ds.lockPOld') + '</p>';
      h += '<details class="ds-how"><summary>' + t('ds.how') + '</summary><ul>' + ['ds.how1', 'ds.how2', 'ds.how3', 'ds.how4', 'ds.how5'].map(function (k) { return '<li>' + t(k) + '</li>'; }).join('') + '</ul></details>';
      if (st.lock === 'p') {
        if (mailInfo === null) loadMail();
        h += '<div class="row"><button class="btn sm plain" type="button" data-dsvault="change">' + t('ds.pwChange') + '</button><button class="btn sm plain" type="button" data-dsvault="recover">' + t('vt.forgot') + '</button><button class="btn sm plain" type="button" data-dsvault="newcode">' + t('vt.newCode') + '</button>' +
          (mailInfo && mailInfo.kept ? '<button class="btn sm plain" type="button" data-dsvault="remind">' + t('vt.remind') + ' (' + App.esc(mailInfo.to) + ')</button>' : '') + '</div>';
      }
      var tr = trash[kind];
      if (!tr) h += '<div class="row"><button class="btn sm plain" type="button" data-dstrash="' + kind + '">' + t('ds.trash') + '</button></div>';
      else {
        h += '<h3>' + t('ds.trash') + '</h3><p class="note">' + t('ds.trashP') + '</p>';
        h += tr.length ? '<div class="mu-list ds-trash">' + tr.map(function (f) {
          return '<div class="mu-row"><span>' + App.esc(kind === 'pics' ? t(f.name === 'tile' ? 'mb.tile' : 'mb.wall') : f.name) + ' <small>' + t('ds.left', f.left) + '</small></span><button class="btn sm" type="button" data-dsback="' + kind + ':' + App.esc(f.id) + '">' + t('ds.back') + '</button></div>';
        }).join('') + '</div>' : '<p class="note">' + t('ds.trashNone') + '</p>';
      }
    }
    if (cur === 'local') h += '<p class="note ds-local">' + t('ds.localP') + (kept === true ? ' ' + t('ds.kept') : kept === false ? ' ' + t('ds.notKept') : '') + '</p>';
    return h;
  }
  // ---------- the password for "my own password" (never stored, never sent) ----------
  var vt = { mode: '', back: '', msg: '', busy: false, code: '', wait: null, email: '', to: '' };
  function vaultOpen(mode, msg) { if (App.sheet() && App.sheet() !== 'dsVault') vt.back = App.sheet(); vt.mode = mode; vt.msg = msg || ''; vt.busy = false; App.openSheet('dsVault'); }
  function vaultClose() { var b = vt.back; vt.mode = ''; vt.code = ''; if (b) App.openSheet(b); else App.closeSheet(); }
  function field(id, label, auto) { return '<label class="vt-field"><span>' + t(label) + '</span><input id="' + id + '" type="' + (id === 'vtCode' ? 'text' : 'password') + '" autocomplete="' + auto + '" spellcheck="false" maxlength="200"></label>'; }
  App.dismiss = App.dismiss || {}; App.opened = App.opened || {};
  App.sheets.dsVault = function () {
    var m = vt.mode, h = '';
    if (m === 'code') {
      h = '<h2>' + t('vt.codeTitle') + '</h2><p>' + t('vt.codeP') + '</p><div class="roomcode xfer" aria-label="' + App.esc(vt.code) + '">' + App.esc(vt.code) + '</div>';
      h += '<h3>' + t('vt.mailTitle') + '</h3>';
      if (ZZ.Consent && ZZ.Consent.child && ZZ.Consent.child()) h += '<p class="note">' + t('vt.mailKids') + '</p>';
      else if (!ZZ.Cloud.mail) h += '<p class="note">' + t('vt.mailNotReady') + '</p>';
      else h += '<p class="note">' + t('vt.mailP') + '</p><p class="warn">' + t('vt.mailWarn') + '</p><p class="note">' + t('vt.mailLater') + '</p>' +
        '<label class="vt-field"><span>' + t('vt.email') + '</span><input id="vtMail" type="email" inputmode="email" autocomplete="email" maxlength="254" value="' + App.esc(vt.email || '') + '"></label>' +
        '<div class="row"><button class="btn" type="button" data-vt="mailGo"' + (vt.busy ? ' disabled' : '') + '>' + t('vt.sendPin') + '</button></div>';
      if (vt.msg) h += '<p class="warn" role="status">' + App.esc(vt.msg) + '</p>';
      return h + '<div class="row"><button class="btn main" type="button" data-vt="codeOk">' + t('vt.codeOk') + '</button></div>';
    }
    if (m === 'pin') {
      h = '<h2>' + t('vt.pinTitle') + '</h2><p class="note">' + App.esc(t('vt.pinP', vt.to || '')) + '</p><label class="vt-field"><span>' + t('vt.pin') + '</span><input id="vtPin" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></label>';
      if (vt.msg) h += '<p class="warn" role="status">' + App.esc(vt.msg) + '</p>';
      return h + '<div class="row"><button class="btn" type="button" data-vt="mailGo">' + t('vt.resend') + '</button><button class="btn" type="button" data-vt="codeOk">' + t('vt.skip') + '</button><button class="btn main" type="button" data-vt="pinOk"' + (vt.busy ? ' disabled' : '') + '>' + t('vt.ok') + '</button></div>';
    }
    if (m === 'set') h = '<h2>' + t('vt.setTitle') + '</h2><p class="note">' + t('vt.setP') + '</p>' + field('vtPw', 'vt.pw', 'new-password') + field('vtPw2', 'vt.pw2', 'new-password');
    else if (m === 'ask') h = '<h2>' + t('vt.askTitle') + '</h2><p class="note">' + t('vt.askP') + '</p>' + field('vtPw', 'vt.pw', 'current-password');
    else if (m === 'change') h = '<h2>' + t('ds.pwChange') + '</h2>' + field('vtOld', 'vt.old', 'current-password') + field('vtPw', 'vt.new', 'new-password') + field('vtPw2', 'vt.pw2', 'new-password');
    else if (m === 'recover') h = '<h2>' + t('vt.recTitle') + '</h2>' + field('vtCode', 'vt.code', 'off') + field('vtPw', 'vt.new', 'new-password') + field('vtPw2', 'vt.pw2', 'new-password');
    if (vt.msg) h += '<p class="warn" role="status">' + App.esc(vt.msg) + '</p>';
    if (vt.busy) h += '<p class="note" role="status">' + t('vt.busy') + '</p>';
    h += '<div class="row"><button class="btn" type="button" data-vt="cancel">' + t('cancel') + '</button><button class="btn main" type="button" data-vt="ok"' + (vt.busy ? ' disabled' : '') + '>' + t('vt.ok') + '</button></div>';
    if (m === 'ask') h += '<div class="row"><button class="btn sm plain" type="button" data-vt="forgot">' + t('vt.forgot') + '</button></div>';
    if (m === 'recover' && mailInfo && mailInfo.kept) h += '<div class="row"><button class="btn sm plain" type="button" data-dsvault="remind">' + t('vt.remind') + ' (' + App.esc(mailInfo.to) + ')</button></div>';
    if (m === 'recover' && mailInfo === null) loadMail();
    return h;
  };
  App.opened.dsVault = function () { var f = document.querySelector('#sheetCard input'); if (f) { try { f.focus(); } catch (e) { /* fine */ } } };
  function val(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  function twice() { var a = val('vtPw'), b = val('vtPw2'); if (a.length < 8) return [null, 'vt.short']; if (b !== a) return [null, 'vt.diff']; return [a, '']; }
  function vtOk() {
    var m = vt.mode;
    if (m === 'ask') {
      var pw = val('vtPw'); if (!pw) return;
      var w = vt.wait; vt.wait = null; vaultClose(); if (w) w(pw);
      return;
    }
    var p = twice();
    if (!p[0]) { vt.msg = t(p[1]); return App.openSheet('dsVault'); }
    var old = val('vtOld'), code = val('vtCode');      // (read before the sheet is drawn again, which empties the fields)
    vt.busy = true; vt.msg = ''; App.openSheet('dsVault');
    var job = m === 'set' ? ZZ.Cloud.makeVault(p[0]) : m === 'change' ? ZZ.Cloud.changePass(old, p[0]) : ZZ.Cloud.recoverVault(code, p[0]);
    job.then(function (r) {
      vt.busy = false;
      if (m === 'set') { if (!r) { vt.msg = t('vt.fail'); return App.openSheet('dsVault'); } st.lock = 'p'; save(); vt.code = r; vt.mode = 'code'; vt.email = ''; return App.openSheet('dsVault'); }
      if (!r) { vt.msg = t(m === 'change' ? 'vt.wrong' : 'vt.badCode'); return App.openSheet('dsVault'); }
      App.toast(t('vt.done'), 3200); vaultClose();
    });
  }
  App.clicks.push(function (d) {
    if (d.dslock === 's') { st.lock = 's'; save(); if (App.sheet()) App.openSheet(App.sheet()); return true; }
    if (d.dslock === 'p') {
      ZZ.Cloud.vaultThere().then(function (has) {
        if (has === true) { st.lock = 'p'; save(); App.openSheet(App.sheet()); }
        else if (has === false) vaultOpen('set');
        else App.toast(t('vt.fail'), 3000);
      });
      return true;
    }
    if (d.dsvault === 'change' || d.dsvault === 'recover') { vaultOpen(d.dsvault); return true; }
    if (d.dsvault === 'remind') { remind(); return true; }
    if (d.dsvault === 'newcode') { newCode(); return true; }
    if (!d.vt) return false;
    if (d.vt === 'ok') vtOk();
    else if (d.vt === 'mailGo') mailGo();
    else if (d.vt === 'pinOk') pinOk();
    else if (d.vt === 'forgot') { var w = vt.wait; vt.wait = null; if (w) w(null); vaultOpen('recover'); }
    else if (d.vt === 'codeOk') vaultClose();
    else { var w2 = vt.wait; vt.wait = null; vaultClose(); if (w2) w2(null); }
    return true;
  });
  // ---------- the recovery code kept with the player's email (opt-in; server/mail.js) ----------
  var mailInfo = null, mailAsking = false;
  function loadMail() {
    if (mailAsking || !ZZ.Cloud || !ZZ.Cloud.mailAsk) return;
    mailAsking = true;
    ZZ.Cloud.mailAsk({ a: 'mailStatus' }).then(function (b) { mailAsking = false; mailInfo = b && b.ok ? b : { ready: false, kept: false }; if (App.sheet()) App.openSheet(App.sheet()); });
  }
  function mailWhy(b) { var w = b && b.why; return t(w === 'email' ? 'vt.badEmail' : w === 'slow' ? 'vt.slowMail' : w === 'pin' ? 'vt.badPin' : w === 'expired' ? 'vt.pinGone' : 'vt.mailFail'); }
  function mailGo() {
    var e = document.getElementById('vtMail'), email = e ? e.value.trim() : vt.email;
    vt.email = email;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || '')) { vt.msg = t('vt.badEmail'); return App.openSheet('dsVault'); }
    vt.busy = true; vt.msg = ''; App.openSheet('dsVault');
    ZZ.Cloud.mailAsk({ a: 'mailStart', email: email, code: vt.code }).then(function (b) {
      vt.busy = false;
      if (b && b.ok) { vt.to = b.to; vt.mode = 'pin'; } else vt.msg = mailWhy(b);
      App.openSheet('dsVault');
    });
  }
  function pinOk() {
    var pin = val('vtPin').replace(/\D/g, '');
    vt.busy = true; vt.msg = ''; App.openSheet('dsVault');
    ZZ.Cloud.mailAsk({ a: 'mailVerify', pin: pin }).then(function (b) {
      vt.busy = false;
      if (b && b.ok) { mailInfo = { ready: true, kept: true, to: vt.to }; App.toast(t('vt.mailKept', vt.to), 4000); vaultClose(); return; }
      vt.msg = mailWhy(b); App.openSheet('dsVault');
    });
  }
  function remind() {
    ZZ.Cloud.mailAsk({ a: 'mailRemind' }).then(function (b) { App.toast(b && b.ok ? t('vt.reminded', b.to) : mailWhy(b), 4200); });
  }
  function newCode() {
    ZZ.Cloud.newRecovery().then(function (code) {
      if (!code) return App.toast(t('vt.fail'), 3000);
      vt.code = code; vt.msg = ''; vt.email = '';
      if (App.sheet() !== 'dsVault') vt.back = App.sheet();
      vt.mode = 'code'; App.openSheet('dsVault');
    });
  }

  // the cloud code asks for the password here, once a visit
  function askPass() { return new Promise(function (res) { vt.wait = res; vaultOpen('ask'); }); }
  if (ZZ.Cloud) { ZZ.Cloud.askPass = askPass; ZZ.Cloud.onWrongPass = function () { App.toast(t('vt.wrong'), 3000); }; }

  // "recently removed": fetched when asked for, cleared when the sheet is opened afresh
  var trash = {};
  function reopen() { if (App.sheet()) App.openSheet(App.sheet()); }
  App.clicks.push(function (d) {
    if (d.dstrash && (d.dstrash === 'pics' || d.dstrash === 'music') && ZZ.Cloud && ZZ.Cloud.file) {
      var k = d.dstrash;
      ZZ.Cloud.file({ a: 'fileList', kind: k, trash: true }).then(function (b) { trash[k] = b && b.files || []; reopen(); });
      return true;
    }
    if (d.dsback && ZZ.Cloud && ZZ.Cloud.file) {
      var q = String(d.dsback).split(':'), kind = q[0], id = q.slice(1).join(':');
      ZZ.Cloud.file({ a: 'fileBack', id: id }).then(function (b) {
        if (!b) {
          // the page only gets the body of a good answer; ask the list again to tell "full" from a failure
          return ZZ.Cloud.file({ a: 'fileList', kind: kind, trash: true }).then(function (l) { trash[kind] = l && l.files || trash[kind]; App.toast(t('ds.backFail'), 3000); reopen(); });
        }
        trash[kind] = (trash[kind] || []).filter(function (f) { return f.id !== id; });
        App.toast(t('ds.backOk'), 2500);
        var pull = App.acts[kind === 'pics' ? 'picPull' : 'muPull'];
        if (pull) pull(); else reopen();
      });
      return true;
    }
    if (!d.dswhere) return false;
    var p = String(d.dswhere).split(':');
    if ((p[0] === 'pics' || p[0] === 'music') && (p[1] === 'local' || (p[1] === 'cloud' && ready()))) { st[p[0]] = p[1]; save(); }
    if (App.sheet()) App.openSheet(App.sheet());
    return true;
  });

  ZZ.DevStore = { html: html, persist: persist, choice: function (kind) { return ready() ? st[kind] : 'local'; }, cloudReady: ready, lockMode: function () { return st.lock === 'p' ? 'p' : 's'; } };
})();
