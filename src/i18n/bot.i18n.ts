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
  | 'albumsTitle'
  | 'albumActiveMarker'
  | 'albumSharedMarker'
  | 'albumOwnedMarker'
  | 'noAlbums'
  | 'availableAlbumTemplates'
  | 'albumNameRequired'
  | 'albumSelectorRequired'
  | 'albumNotFound'
  | 'albumAmbiguous'
  | 'albumCreatePrompt'
  | 'albumSelectPrompt'
  | 'albumCreated'
  | 'albumCreateFailed'
  | 'albumSelected'
  | 'albumSelectFailed'
  | 'albumRenamed'
  | 'albumRenameFailed'
  | 'albumDeleted'
  | 'albumDeleteFailed'
  | 'albumLeft'
  | 'albumLeaveFailed'
  | 'albumOwnerOnlyRename'
  | 'albumOwnerOnlyDelete'
  | 'albumCannotLeaveOwned'
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
  | 'shareActiveAlbum'
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
  | 'compareUnknownUser'
  | 'compareSelf'
  | 'compareNoTargetAlbums'
  | 'compareChooseAlbum'
  | 'compareAlbumNotFound'
  | 'compareTitle'
  | 'compareCountryScope'
  | 'compareAllCountriesScope'
  | 'compareNoMatches'
  | 'compareTheyCanGive'
  | 'compareYouCanGive'
  | 'compareNone'
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
    albumsTitle: 'Albums',
    albumActiveMarker: 'active',
    albumSharedMarker: 'shared',
    albumOwnedMarker: 'owned',
    noAlbums: 'You do not have albums yet.',
    availableAlbumTemplates: 'Available album templates: {templates}.',
    albumNameRequired: 'Send an album name, for example: new album Qatar 2022.',
    albumSelectorRequired: 'Send the album name or number, for example: use album 1.',
    albumNotFound: 'I could not find that album.',
    albumAmbiguous: 'More than one album matches. Use the album number or full name.',
    albumCreatePrompt: 'Create or select an album first.',
    albumSelectPrompt: 'Select an album first.',
    albumCreated: 'Album created and selected: {albumName}.',
    albumCreateFailed: 'I could not create the album.',
    albumSelected: 'Active album selected: {albumName}.',
    albumSelectFailed: 'I could not select that album.',
    albumRenamed: 'Album renamed to {albumName}.',
    albumRenameFailed: 'I could not rename the album.',
    albumDeleted: 'Album deleted: {albumName}.',
    albumDeleteFailed: 'I could not delete the album.',
    albumLeft: 'You left the shared album: {albumName}.',
    albumLeaveFailed: 'I could not leave the album.',
    albumOwnerOnlyRename: 'Only the owner can rename this album.',
    albumOwnerOnlyDelete: 'Only the owner can delete this album.',
    albumCannotLeaveOwned: 'You own this album. Delete it instead of leaving it.',
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
    shareActiveAlbum: 'Share active album: {albumName}.',
    shareUnknownUser: 'I do not know @{username}. That person must open the bot and send /start first.',
    shareSelf: 'You cannot share the album with yourself.',
    shareAlreadyShared: 'You already share the active album with @{username}.',
    shareSent: 'Request sent to @{username} to share the active album.',
    shareInvite: '{inviterName} wants to share an album with you.\n\nYes or No?',
    shareInvalid: 'Invalid album sharing response.',
    shareRequestNotFound: 'Shared album request not found.',
    shareAlreadyAnswered: 'This request was already answered.',
    shareAcceptError: 'I could not accept the request.',
    shareDeclineError: 'I could not decline the request.',
    shareAccepted: 'Yes. You now share the same album.',
    shareAcceptedNotify: '{responderName} accepted sharing the album with you.',
    shareDeclined: 'No. Request declined.',
    shareDeclinedNotify: '{responderName} declined sharing the album.',
    compareUnknownUser: 'I do not know @{username}. That person must open the bot and send /start first.',
    compareSelf: 'Choose another user to compare albums.',
    compareNoTargetAlbums: '{username} has no albums yet.',
    compareChooseAlbum: 'Choose which album from {username} to compare.',
    compareAlbumNotFound: 'I could not find that album.',
    compareTitle: 'Compare {yourAlbum} with {otherAlbum} from {username}.',
    compareCountryScope: 'Country: {countryCode}.',
    compareAllCountriesScope: 'Country: all.',
    compareNoMatches: 'No duplicate-for-missing matches found.',
    compareTheyCanGive: '{username} can give you: {stickers}.',
    compareYouCanGive: 'You can give {username}: {stickers}.',
    compareNone: 'none',
    help: [
      'Available commands:',
      'start: open the album menu.',
      'albums: list your albums and show the active one.',
      'new album My Album: create and select an album.',
      'use album My Album or select album 1: switch active album.',
      'rename album New Name: rename the active album.',
      'delete album: delete the active album.',
      'leave album: leave a shared album.',
      'share @username: request sharing the active album with another Telegram user.',
      'compare @username: compare your active album with one of their albums.',
      'compare arg @username: compare only one country.',
      'trade arg2 arg4: post a trade where you give ARG 2 and need ARG 4.',
      'trade -duplicate arg4: post a trade where you give any duplicate and need ARG 4.',
      'trade arg4 -missing: post a trade where you give ARG 4 and need any missing sticker.',
      'trades: list your active and pending trades.',
      'trade cancel T1: cancel one of your active or pending trades.',
      'marketplace: list active trades from other users.',
      'marketplace -give arg4: find trades where someone gives ARG 4.',
      'marketplace -need arg4: find trades where someone needs ARG 4.',
      'marketplace @username or marketplace -mine: filter marketplace trades.',
      'arg4, arg 4, ARG-4, or argentina 4: check a sticker.',
      'arg: show country progress.',
      'arg -name: show names when available.',
      'add arg4: add a sticker.',
      'rm arg4 or remove arg 4: remove a sticker.',
      'undo: revert the last change.',
      'missing arg, duplicates, progress.',
    ].join('\n'),
  },
  es: {
    chooseLanguage: 'Elige tu idioma.',
    languageSaved: 'Idioma configurado en español.',
    buttonYes: 'Sí',
    buttonNo: 'No',
    buttonCreateAlbum: 'Crear',
    buttonSelectAlbum: 'Usar',
    unknownCallback: 'Acción inválida.',
    startMenu: 'Menú de álbumes',
    activeAlbumLine: 'Álbum activo: {albumName}.',
    noActiveAlbum: 'Todavía no hay álbum activo.',
    yourAlbumsTitle: 'Tus álbumes:',
    availableAlbumsTitle: 'Álbumes disponibles:',
    albumsTitle: 'Álbumes',
    albumActiveMarker: 'activo',
    albumSharedMarker: 'compartido',
    albumOwnedMarker: 'propio',
    noAlbums: 'Todavía no tienes álbumes.',
    availableAlbumTemplates: 'Plantillas de álbum disponibles: {templates}.',
    albumNameRequired: 'Indica un nombre de álbum, por ejemplo: new album Qatar 2022.',
    albumSelectorRequired: 'Indica el nombre o número del álbum, por ejemplo: use album 1.',
    albumNotFound: 'No encontré ese álbum.',
    albumAmbiguous: 'Más de un álbum coincide. Usa el número o el nombre completo.',
    albumCreatePrompt: 'Primero crea o selecciona un álbum.',
    albumSelectPrompt: 'Primero selecciona un álbum.',
    albumCreated: 'Álbum creado y seleccionado: {albumName}.',
    albumCreateFailed: 'No pude crear el álbum.',
    albumSelected: 'Álbum activo seleccionado: {albumName}.',
    albumSelectFailed: 'No pude seleccionar ese álbum.',
    albumRenamed: 'Álbum renombrado a {albumName}.',
    albumRenameFailed: 'No pude renombrar el álbum.',
    albumDeleted: 'Álbum eliminado: {albumName}.',
    albumDeleteFailed: 'No pude eliminar el álbum.',
    albumLeft: 'Saliste del álbum compartido: {albumName}.',
    albumLeaveFailed: 'No pude salir del álbum.',
    albumOwnerOnlyRename: 'Solo el dueño puede renombrar este álbum.',
    albumOwnerOnlyDelete: 'Solo el dueño puede eliminar este álbum.',
    albumCannotLeaveOwned: 'Este álbum es tuyo. Elimínalo en vez de salir.',
    commandRequiresActiveAlbum: 'Primero crea o selecciona un álbum.',
    unknownAlbumAction: 'Acción de álbum no encontrada.',
    emptyMessage: 'Mensaje vacío.',
    unknownCommand: 'No pude detectar país, número o comando.',
    stickerRequired: 'Indica una estampa, por ejemplo: add arg4.',
    stickerNotOwned: 'No tienes {label}.',
    stickerOwned: 'Sí tienes {label}. Cantidad: {quantity}.',
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
    undoApplied: 'Deshacer aplicado: se revirtió el {action} de {label}. Ahora tienes {quantity}.',
    missingNeedsCountry: 'Indica un país para ver faltantes, por ejemplo: missing arg.',
    countryComplete: '{countryCode} está completo.',
    duplicatesNone: 'No tienes estampas duplicadas.',
    duplicatesCountryNone: 'No tienes duplicadas de {countryCode}.',
    duplicatesList: 'Duplicadas: {stickers}.',
    generalProgressTitle: 'Progreso general',
    generalProgressOwned: 'Tienes {owned}/{total} únicas ({percentage}).',
    generalProgressDuplicates: 'Duplicadas: {duplicates}.',
    generalProgressCountries: 'Países iniciados: {countriesStarted}/{countriesTotal}.',
    invalidStickerNumber: '{label} no existe en el catálogo. {countryCode} va del 1 al {total}.',
    shareActiveAlbum: 'Compartir álbum activo: {albumName}.',
    shareUnknownUser: 'No conozco a @{username}. Esa persona debe abrir el bot y mandar /start primero.',
    shareSelf: 'No puedes compartir el álbum contigo mismo.',
    shareAlreadyShared: 'Ya compartes el álbum activo con @{username}.',
    shareSent: 'Solicitud enviada a @{username} para compartir el álbum activo.',
    shareInvite: '{inviterName} quiere compartir un álbum contigo.\n\n¿Sí o no?',
    shareInvalid: 'Respuesta de compartir álbum inválida.',
    shareRequestNotFound: 'Solicitud de álbum compartido no encontrada.',
    shareAlreadyAnswered: 'Esta solicitud ya fue respondida.',
    shareAcceptError: 'No pude aceptar la solicitud.',
    shareDeclineError: 'No pude rechazar la solicitud.',
    shareAccepted: 'Sí. Ahora compartes el mismo álbum.',
    shareAcceptedNotify: '{responderName} aceptó compartir el álbum contigo.',
    shareDeclined: 'No. Solicitud rechazada.',
    shareDeclinedNotify: '{responderName} rechazó compartir el álbum.',
    compareUnknownUser: 'No conozco a @{username}. Esa persona debe abrir el bot y mandar /start primero.',
    compareSelf: 'Elige otro usuario para comparar albumes.',
    compareNoTargetAlbums: '{username} no tiene albumes todavia.',
    compareChooseAlbum: 'Elige cual album de {username} quieres comparar.',
    compareAlbumNotFound: 'No encontre ese album.',
    compareTitle: 'Comparando {yourAlbum} con {otherAlbum} de {username}.',
    compareCountryScope: 'Pais: {countryCode}.',
    compareAllCountriesScope: 'Pais: todos.',
    compareNoMatches: 'No encontre cruces de duplicadas contra faltantes.',
    compareTheyCanGive: '{username} te puede dar: {stickers}.',
    compareYouCanGive: 'Tu le puedes dar a {username}: {stickers}.',
    compareNone: 'ninguna',
    help: [
      'Comandos disponibles:',
      'start: abre el menú de álbumes.',
      'albums: lista tus álbumes y muestra el activo.',
      'new album Mi Álbum: crea y selecciona un álbum.',
      'use album Mi Álbum o select album 1: cambia el álbum activo.',
      'rename album Nuevo Nombre: renombra el álbum activo.',
      'delete album: elimina el álbum activo.',
      'leave album: sal de un álbum compartido.',
      'share @usuario: solicita compartir el álbum activo con otro usuario de Telegram.',
      'compare @username: compara tu album activo con uno de sus albumes.',
      'compare arg @username: compara solo un pais.',
      'trade arg2 arg4: publica un intercambio donde das ARG 2 y ocupas ARG 4.',
      'trade -duplicate arg4: publica un intercambio donde das cualquier duplicada y ocupas ARG 4.',
      'trade arg4 -missing: publica un intercambio donde das ARG 4 y ocupas cualquier faltante.',
      'trades: lista tus trades activos y pendientes.',
      'trade cancel T1: cancela uno de tus trades activos o pendientes.',
      'marketplace: lista trades activos de otros usuarios.',
      'marketplace -give arg4: busca trades donde alguien da ARG 4.',
      'marketplace -need arg4: busca trades donde alguien ocupa ARG 4.',
      'marketplace @username o marketplace -mine: filtra trades del marketplace.',
      'arg4, arg 4, ARG-4 o argentina 4: consulta una estampa.',
      'arg: muestra progreso del país.',
      'arg -name: muestra nombres cuando existan en el catálogo.',
      'add arg4: agrega una estampa.',
      'rm arg4 o remove arg 4: elimina una estampa.',
      'undo: revierte el último cambio.',
      'missing arg, duplicates, progress.',
    ].join('\n'),
  },
  zh: {
    compareUnknownUser: 'I do not know @{username}. That person must open the bot and send /start first.',
    compareSelf: 'Choose another user to compare albums.',
    compareNoTargetAlbums: '{username} has no albums yet.',
    compareChooseAlbum: 'Choose which album from {username} to compare.',
    compareAlbumNotFound: 'I could not find that album.',
    compareTitle: 'Compare {yourAlbum} with {otherAlbum} from {username}.',
    compareCountryScope: 'Country: {countryCode}.',
    compareAllCountriesScope: 'Country: all.',
    compareNoMatches: 'No duplicate-for-missing matches found.',
    compareTheyCanGive: '{username} can give you: {stickers}.',
    compareYouCanGive: 'You can give {username}: {stickers}.',
    compareNone: 'none',
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
    albumsTitle: '相册',
    albumActiveMarker: '当前',
    albumSharedMarker: '共享',
    albumOwnedMarker: '拥有',
    noAlbums: '你还没有相册。',
    availableAlbumTemplates: '可用相册模板：{templates}。',
    albumNameRequired: '请发送相册名称，例如：new album Qatar 2022。',
    albumSelectorRequired: '请发送相册名称或编号，例如：use album 1。',
    albumNotFound: '找不到该相册。',
    albumAmbiguous: '有多个相册匹配。请使用编号或完整名称。',
    albumCreatePrompt: '请先创建或选择一个相册。',
    albumSelectPrompt: '请先选择一个相册。',
    albumCreated: '已创建并选择相册：{albumName}。',
    albumCreateFailed: '无法创建相册。',
    albumSelected: '已选择当前相册：{albumName}。',
    albumSelectFailed: '无法选择该相册。',
    albumRenamed: '相册已重命名为：{albumName}。',
    albumRenameFailed: '无法重命名相册。',
    albumDeleted: '相册已删除：{albumName}。',
    albumDeleteFailed: '无法删除相册。',
    albumLeft: '你已离开共享相册：{albumName}。',
    albumLeaveFailed: '无法离开相册。',
    albumOwnerOnlyRename: '只有拥有者可以重命名此相册。',
    albumOwnerOnlyDelete: '只有拥有者可以删除此相册。',
    albumCannotLeaveOwned: '这是你拥有的相册。请删除它，而不是离开它。',
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
    undoApplied: '已撤销：{label} 的 {action} 已还原。现在数量：{quantity}。',
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
    shareActiveAlbum: '共享当前相册：{albumName}。',
    shareUnknownUser: '我不认识 @{username}。该用户必须先打开机器人并发送 /start。',
    shareSelf: '你不能和自己共享相册。',
    shareAlreadyShared: '你已经和 @{username} 共享当前相册。',
    shareSent: '已向 @{username} 发送共享当前相册的请求。',
    shareInvite: '{inviterName} 想和你共享一个相册。\n\n是或否？',
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
      'start：打开相册菜单。',
      'albums：列出你的相册并显示当前相册。',
      'new album My Album：创建并选择相册。',
      'use album My Album 或 select album 1：切换当前相册。',
      'rename album New Name：重命名当前相册。',
      'delete album：删除当前相册。',
      'leave album：离开共享相册。',
      'share @username：请求与另一位 Telegram 用户共享当前相册。',
      'compare @username: compare your active album with one of their albums.',
      'compare arg @username: compare only one country.',
      'arg4、arg 4、ARG-4 或 argentina 4：查询贴纸。',
      'arg：显示国家进度。',
      'arg -name：显示目录中已有的名称。',
      'add arg4：添加贴纸。',
      'rm arg4 或 remove arg 4：删除贴纸。',
      'undo：撤销最后一次更改。',
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
