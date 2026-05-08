export type BotLanguage = 'en' | 'es' | 'zh';

type TranslationParams = Record<string, string | number>;

type TranslationKey =
  | 'chooseLanguage'
  | 'languageSaved'
  | 'buttonYes'
  | 'buttonNo'
  | 'buttonCreateAlbum'
  | 'buttonSelectAlbum'
  | 'unknownCallback'
  | 'startMenu'
  | 'activeAlbumLine'
  | 'noActiveAlbum'
  | 'yourAlbumsTitle'
  | 'availableAlbumsTitle'
  | 'albumCreated'
  | 'albumSelected'
  | 'commandRequiresActiveAlbum'
  | 'unknownAlbumAction'
  | 'emptyMessage'
  | 'unknownCommand'
  | 'stickerRequired'
  | 'stickerNotOwned'
  | 'stickerOwned'
  | 'unknownCountry'
  | 'countryHeader'
  | 'countryProgress'
  | 'ownedStickers'
  | 'noCountryStickers'
  | 'missingStickers'
  | 'stickerAdded'
  | 'duplicateSuffix'
  | 'stickerRemoved'
  | 'cannotRemove'
  | 'nothingToUndo'
  | 'undoApplied'
  | 'missingNeedsCountry'
  | 'countryComplete'
  | 'duplicatesNone'
  | 'duplicatesCountryNone'
  | 'duplicatesList'
  | 'generalProgressTitle'
  | 'generalProgressOwned'
  | 'generalProgressDuplicates'
  | 'generalProgressCountries'
  | 'invalidStickerNumber'
  | 'shareUnknownUser'
  | 'shareSelf'
  | 'shareAlreadyShared'
  | 'shareSent'
  | 'shareInvite'
  | 'shareInvalid'
  | 'shareRequestNotFound'
  | 'shareAlreadyAnswered'
  | 'shareAcceptError'
  | 'shareDeclineError'
  | 'shareAccepted'
  | 'shareAcceptedNotify'
  | 'shareDeclined'
  | 'shareDeclinedNotify'
  | 'help';

const translations: Record<BotLanguage, Record<TranslationKey, string>> = {
  en: {
    chooseLanguage: 'Choose your language.',
    languageSaved: 'Language set to English.',
    buttonYes: 'Yes',
    buttonNo: 'No',
    buttonCreateAlbum: 'Create',
    buttonSelectAlbum: 'Use',
    unknownCallback: 'Invalid action.',
    startMenu: 'Album menu',
    activeAlbumLine: 'Active album: {albumName}.',
    noActiveAlbum: 'No active album yet.',
    yourAlbumsTitle: 'Your albums:',
    availableAlbumsTitle: 'Available albums:',
    albumCreated: 'Album created and selected: {albumName}.',
    albumSelected: 'Active album selected: {albumName}.',
    commandRequiresActiveAlbum: 'Create or select an album first.',
    unknownAlbumAction: 'Album action not found.',
    emptyMessage: 'Empty message.',
    unknownCommand: 'I could not detect a country, number, or command.',
    stickerRequired: 'Send a sticker, for example: add arg4.',
    stickerNotOwned: 'You do not have {label}.',
    stickerOwned: 'You have {label}. Quantity: {quantity}.',
    unknownCountry: 'I do not recognize {country}.',
    countryHeader: '{countryCode} {countryName}',
    countryProgress: 'You have {owned}/{total} ({percentage}).',
    ownedStickers: 'Stickers: {stickers}.',
    noCountryStickers: 'You do not have stickers from {countryCode}.',
    missingStickers: 'Missing ({count}): {stickers}.',
    stickerAdded: '{label} added. You now have {quantity}{duplicateText}.',
    duplicateSuffix: ' ({count} duplicate/s)',
    stickerRemoved: '{label} removed. You now have {quantity}.',
    cannotRemove: 'You cannot remove {label} because you do not have it.',
    nothingToUndo: 'There are no actions to undo.',
    undoApplied: 'Undo applied: reverted the {action} of {label}. You now have {quantity}.',
    missingNeedsCountry: 'Send a country to see missing stickers, for example: missing arg.',
    countryComplete: '{countryCode} is complete.',
    duplicatesNone: 'You do not have duplicate stickers.',
    duplicatesCountryNone: 'You do not have duplicates from {countryCode}.',
    duplicatesList: 'Duplicates: {stickers}.',
    generalProgressTitle: 'Overall progress',
    generalProgressOwned: 'You have {owned}/{total} unique stickers ({percentage}).',
    generalProgressDuplicates: 'Duplicates: {duplicates}.',
    generalProgressCountries: 'Started countries: {countriesStarted}/{countriesTotal}.',
    invalidStickerNumber: '{label} does not exist in the catalog. {countryCode} goes from 1 to {total}.',
    shareUnknownUser: 'I do not know @{username}. That person must open the bot and send /start first.',
    shareSelf: 'You cannot share the album with yourself.',
    shareAlreadyShared: 'You already share an album with @{username}.',
    shareSent: 'Request sent to @{username}.',
    shareInvite: '{inviterName} wants to share their album with you.\n\nYes or No?',
    shareInvalid: 'Invalid album sharing response.',
    shareRequestNotFound: 'Shared album request not found.',
    shareAlreadyAnswered: 'This request was already answered.',
    shareAcceptError: 'I could not accept the request.',
    shareDeclineError: 'I could not decline the request.',
    shareAccepted: 'Yes. You now share the same album.',
    shareAcceptedNotify: '{responderName} accepted sharing the album with you.',
    shareDeclined: 'No. Request declined.',
    shareDeclinedNotify: '{responderName} declined sharing the album.',
    help: [
      'Available commands:',
      'arg4, arg 4, ARG-4, or argentina 4: check a sticker.',
      'arg: show country progress.',
      'arg -name: show names when available.',
      'add arg4: add a sticker.',
      'rm arg4 or remove arg 4: remove a sticker.',
      'undo: revert the last change.',
      'share @username: request sharing the same album with another Telegram user.',
      'start: create or select an album.',
      'missing arg, duplicates, progress.',
    ].join('\n'),
  },
  es: {
    chooseLanguage: 'Elige tu idioma.',
    languageSaved: 'Idioma configurado en español.',
    buttonYes: 'Si',
    buttonNo: 'No',
    buttonCreateAlbum: 'Crear',
    buttonSelectAlbum: 'Usar',
    unknownCallback: 'Accion invalida.',
    startMenu: 'Menu de albumes',
    activeAlbumLine: 'Album activo: {albumName}.',
    noActiveAlbum: 'Todavia no hay album activo.',
    yourAlbumsTitle: 'Tus albumes:',
    availableAlbumsTitle: 'Albumes disponibles:',
    albumCreated: 'Album creado y seleccionado: {albumName}.',
    albumSelected: 'Album activo seleccionado: {albumName}.',
    commandRequiresActiveAlbum: 'Primero crea o selecciona un album.',
    unknownAlbumAction: 'Accion de album no encontrada.',
    emptyMessage: 'Mensaje vacio.',
    unknownCommand: 'No pude detectar pais, numero o comando.',
    stickerRequired: 'Indica una estampa, por ejemplo: add arg4.',
    stickerNotOwned: 'No tienes {label}.',
    stickerOwned: 'Si tienes {label}. Cantidad: {quantity}.',
    unknownCountry: 'No reconozco {country}.',
    countryHeader: '{countryCode} {countryName}',
    countryProgress: 'Tienes {owned}/{total} ({percentage}).',
    ownedStickers: 'Estampas: {stickers}.',
    noCountryStickers: 'No tienes estampas de {countryCode}.',
    missingStickers: 'Faltantes ({count}): {stickers}.',
    stickerAdded: '{label} agregada. Ahora tienes {quantity}{duplicateText}.',
    duplicateSuffix: ' ({count} duplicada/s)',
    stickerRemoved: '{label} eliminada. Ahora tienes {quantity}.',
    cannotRemove: 'No puedes eliminar {label} porque no la tienes.',
    nothingToUndo: 'No hay acciones para deshacer.',
    undoApplied: 'Undo aplicado: se revirtio el {action} de {label}. Ahora tienes {quantity}.',
    missingNeedsCountry: 'Indica un pais para ver faltantes, por ejemplo: missing arg.',
    countryComplete: '{countryCode} esta completo.',
    duplicatesNone: 'No tienes estampas duplicadas.',
    duplicatesCountryNone: 'No tienes duplicadas de {countryCode}.',
    duplicatesList: 'Duplicadas: {stickers}.',
    generalProgressTitle: 'Progreso general',
    generalProgressOwned: 'Tienes {owned}/{total} unicas ({percentage}).',
    generalProgressDuplicates: 'Duplicadas: {duplicates}.',
    generalProgressCountries: 'Paises iniciados: {countriesStarted}/{countriesTotal}.',
    invalidStickerNumber: '{label} no existe en el catalogo. {countryCode} va del 1 al {total}.',
    shareUnknownUser: 'No conozco a @{username}. Esa persona debe abrir el bot y mandar /start primero.',
    shareSelf: 'No puedes compartir el album contigo mismo.',
    shareAlreadyShared: 'Ya compartes album con @{username}.',
    shareSent: 'Solicitud enviada a @{username}.',
    shareInvite: '{inviterName} quiere compartir su album contigo.\n\nSi o No?',
    shareInvalid: 'Respuesta de compartir album invalida.',
    shareRequestNotFound: 'Solicitud de album compartido no encontrada.',
    shareAlreadyAnswered: 'Esta solicitud ya fue respondida.',
    shareAcceptError: 'No pude aceptar la solicitud.',
    shareDeclineError: 'No pude rechazar la solicitud.',
    shareAccepted: 'Si. Ahora compartes el mismo album.',
    shareAcceptedNotify: '{responderName} acepto compartir el album contigo.',
    shareDeclined: 'No. Solicitud rechazada.',
    shareDeclinedNotify: '{responderName} rechazo compartir el album.',
    help: [
      'Comandos disponibles:',
      'arg4, arg 4, ARG-4 o argentina 4: consulta una estampa.',
      'arg: muestra progreso del pais.',
      'arg -name: muestra nombres cuando existan en el catalogo.',
      'add arg4: agrega una estampa.',
      'rm arg4 o remove arg 4: elimina una estampa.',
      'undo: revierte el ultimo cambio.',
      'share @usuario: solicita compartir el mismo album con otro usuario de Telegram.',
      'start: crea o selecciona un album.',
      'missing arg, duplicates, progress.',
    ].join('\n'),
  },
  zh: {
    chooseLanguage: '请选择语言。',
    languageSaved: '语言已设置为中文。',
    buttonYes: '是',
    buttonNo: '否',
    buttonCreateAlbum: '创建',
    buttonSelectAlbum: '使用',
    unknownCallback: '无效操作。',
    startMenu: '相册菜单',
    activeAlbumLine: '当前相册：{albumName}。',
    noActiveAlbum: '还没有当前相册。',
    yourAlbumsTitle: '你的相册：',
    availableAlbumsTitle: '可用相册：',
    albumCreated: '已创建并选择相册：{albumName}。',
    albumSelected: '已选择当前相册：{albumName}。',
    commandRequiresActiveAlbum: '请先创建或选择一个相册。',
    unknownAlbumAction: '找不到相册操作。',
    emptyMessage: '消息为空。',
    unknownCommand: '我无法识别国家、编号或命令。',
    stickerRequired: '请发送一张贴纸，例如：add arg4。',
    stickerNotOwned: '你没有 {label}。',
    stickerOwned: '你有 {label}。数量：{quantity}。',
    unknownCountry: '我不认识 {country}。',
    countryHeader: '{countryCode} {countryName}',
    countryProgress: '你有 {owned}/{total}（{percentage}）。',
    ownedStickers: '贴纸：{stickers}。',
    noCountryStickers: '你没有 {countryCode} 的贴纸。',
    missingStickers: '缺少（{count}）：{stickers}。',
    stickerAdded: '已添加 {label}。现在数量：{quantity}{duplicateText}。',
    duplicateSuffix: '（{count} 张重复）',
    stickerRemoved: '已删除 {label}。现在数量：{quantity}。',
    cannotRemove: '无法删除 {label}，因为你没有它。',
    nothingToUndo: '没有可撤销的操作。',
    undoApplied: '已撤销：{label} 的{action}已还原。现在数量：{quantity}。',
    missingNeedsCountry: '请发送国家来查看缺少的贴纸，例如：missing arg。',
    countryComplete: '{countryCode} 已完成。',
    duplicatesNone: '你没有重复贴纸。',
    duplicatesCountryNone: '你没有 {countryCode} 的重复贴纸。',
    duplicatesList: '重复贴纸：{stickers}。',
    generalProgressTitle: '总体进度',
    generalProgressOwned: '你有 {owned}/{total} 张唯一贴纸（{percentage}）。',
    generalProgressDuplicates: '重复：{duplicates}。',
    generalProgressCountries: '已开始国家：{countriesStarted}/{countriesTotal}。',
    invalidStickerNumber: '{label} 不在目录中。{countryCode} 范围是 1 到 {total}。',
    shareUnknownUser: '我不认识 @{username}。该用户必须先打开机器人并发送 /start。',
    shareSelf: '你不能和自己共享相册。',
    shareAlreadyShared: '你已经和 @{username} 共享相册。',
    shareSent: '已向 @{username} 发送请求。',
    shareInvite: '{inviterName} 想和你共享相册。\n\n是或否？',
    shareInvalid: '共享相册响应无效。',
    shareRequestNotFound: '找不到共享相册请求。',
    shareAlreadyAnswered: '此请求已被回复。',
    shareAcceptError: '无法接受请求。',
    shareDeclineError: '无法拒绝请求。',
    shareAccepted: '是。你们现在共享同一个相册。',
    shareAcceptedNotify: '{responderName} 已接受与你共享相册。',
    shareDeclined: '否。请求已拒绝。',
    shareDeclinedNotify: '{responderName} 拒绝共享相册。',
    help: [
      '可用命令：',
      'arg4、arg 4、ARG-4 或 argentina 4：查询贴纸。',
      'arg：显示国家进度。',
      'arg -name：显示已有名称。',
      'add arg4：添加贴纸。',
      'rm arg4 或 remove arg 4：删除贴纸。',
      'undo：撤销最后一次更改。',
      'share @username：请求与另一个 Telegram 用户共享同一个相册。',
      'start：创建或选择相册。',
      'missing arg、duplicates、progress。',
    ].join('\n'),
  },
};

export const languageKeyboard = {
  inline_keyboard: [
    [
      { text: 'English 🇺🇸', callback_data: 'lang:en' },
      { text: 'Español 🇪🇸', callback_data: 'lang:es' },
      { text: '中文 🇨🇳', callback_data: 'lang:zh' },
    ],
  ],
};

export const isBotLanguage = (value: string): value is BotLanguage =>
  value === 'en' || value === 'es' || value === 'zh';

export const t = (
  language: BotLanguage,
  key: TranslationKey,
  params: TranslationParams = {},
): string =>
  Object.entries(params).reduce(
    (message, [paramKey, paramValue]) =>
      message.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue)),
    translations[language][key],
  );
