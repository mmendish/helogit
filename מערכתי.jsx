#target "InDesign"

(function () {
    var previousUI = app.scriptPreferences.userInteractionLevel;
    app.scriptPreferences.userInteractionLevel = UserInteractionLevels.INTERACT_WITH_ALL;

    try {
        if (app.documents.length === 0) {
            alert("Open an InDesign document before running this script.");
            return;
        }

        var mode = chooseWorkflow();
        if (!mode) {
            return;
        }

        if (mode === "patitim") {
            runPatitim();
        } else if (mode === "katava") {
            runKatava();
        }
    } catch (error) {
        alert("Error: " + error.message);
    } finally {
        resetFindChangePreferences();
        app.scriptPreferences.userInteractionLevel = previousUI;
    }
})();

function chooseWorkflow() {
    var dialog = new Window("dialog", "Select workflow");
    dialog.alignChildren = "left";

    var group = dialog.add("panel", undefined, "Workflow");
    group.alignChildren = "left";

    var patitim = group.add("radiobutton", undefined, "Patitim / LIBA / ZOHAR");
    var katava = group.add("radiobutton", undefined, "Katava articles");
    patitim.value = true;

    var buttons = dialog.add("group");
    buttons.alignment = "right";
    buttons.add("button", undefined, "OK", { name: "ok" });
    buttons.add("button", undefined, "Cancel", { name: "cancel" });

    if (dialog.show() !== 1) {
        return null;
    }
    return patitim.value ? "patitim" : "katava";
}

function runPatitim() {
    var doc = app.activeDocument;

    var mainFrame = findTextFrameByAltText(doc, "MAIN_TEXT");
    if (!mainFrame) {
        alert("Missing text frame labeled MAIN_TEXT.");
        return;
    }

    var targetPage = getItemPage(mainFrame);
    var kituvFrame = findTextFrameByAltText(doc, "KITUV", targetPage);
    var libaFrame = findTextFrameByAltText(doc, "LIBA", targetPage);
    var zoharFrame = findTextFrameByAltText(doc, "ZOHAR", targetPage);

    if (!kituvFrame) {
        alert("Missing text frame labeled KITUV.");
        return;
    }

    if (!libaFrame || !zoharFrame) {
        alert("Missing text frames labeled LIBA and/or ZOHAR.");
        return;
    }

    var textFile = selectTextFile();
    if (!textFile) {
        return;
    }

    var bodyStyle = getParagraphStyle(doc, "body");
    var kituvStyle = getParagraphStyle(doc, "כיתוב");
    var b1Style = getCharacterStyle(doc, "B1");
    var libaStyle = getParagraphStyle(doc, "ליבא בעי");
    var zoharStyle = getParagraphStyle(doc, "זוהר");
    var patitim2Style = getParagraphStyle(doc, "פתיתים 2");
    var patitim1ParagraphStyle = findParagraphStyle(doc, "פתיתים 1");
    var patitim1CharacterStyle = null;

    if (!patitim1ParagraphStyle) {
        patitim1CharacterStyle = findCharacterStyle(doc, "פתיתים 1");
    }

    if (!bodyStyle || !kituvStyle || !b1Style || !libaStyle || !zoharStyle || !patitim2Style) {
        return;
    }

    if (!patitim1ParagraphStyle && !patitim1CharacterStyle) {
        alert("Missing style: פתיתים 1");
        return;
    }

    mainFrame.contents = "";
    kituvFrame.contents = "";

    mainFrame.place(textFile);
    var mainStory = mainFrame.parentStory;
    removeLeadingEmptyParagraphs(mainStory);

    var kituvParagraph = findParagraphStartingWith(mainStory, "!");
    if (!kituvParagraph) {
        alert("Could not find a paragraph starting with '!'.");
        return;
    }

    var kituvText = stripTrailingReturn(kituvParagraph.contents);
    kituvText = kituvText.replace(/^\s*!\s*/, "");
    kituvParagraph.remove();

    kituvFrame.contents = kituvText;
    applyParagraphStyleToStory(kituvFrame.parentStory, kituvStyle, true);

    normalizeMainStory(mainStory);
    applyCharacterStyleToFontStyles(mainStory, b1Style, ["Bold", "Bold Italic"]);
    applyParagraphStyleToStory(mainStory, bodyStyle, false);

    var tempFrame = null;
    var libaFrames = [];
    var libaBlock = extractBlockByMarkerAndContains(mainStory, "#", "ליבא בעי");
    if (libaBlock) {
        tempFrame = createTempTextFrame(doc, mainFrame);
        tempFrame.contents = libaBlock ? String(libaBlock) : "";
        removeFirstParagraphIfStartsWith(tempFrame.parentStory, "#");

        var libaBlocks = extractBlocksByMarker(tempFrame.parentStory, "$");
        if (libaBlocks.length > 0) {
            libaFrames = populateLibaFrames(libaFrame, libaBlocks, libaStyle, bodyStyle);
        }
    }

    if (tempFrame) {
        tempFrame.remove();
    }

    var zoharText = extractTailAfterMarker(mainStory, "#", "תיקוני זוהר");
    if (zoharText !== null) {
        zoharFrame.contents = zoharText ? String(zoharText) : "";
        var zoharParagraph = findParagraphStartingWith(zoharFrame.parentStory, "$");
        if (zoharParagraph) {
            removeLeadingMarker(zoharParagraph, "$");
            applyParagraphStyleToParagraph(zoharParagraph, zoharStyle, false);
        }
        applyMarkerParagraphStyle(zoharFrame.parentStory, "%", zoharStyle);
    }

    applyPatitim1Styles(mainStory, patitim1ParagraphStyle, patitim1CharacterStyle);
    applyPatitim2Pairs(mainStory, patitim2Style);

    cleanAllTextFrames(doc);

    if (libaFrames.length > 0) {
        fitFramesToContent(libaFrames);
        positionLibaFramesFromBottom(libaFrames, 259, 3);

        var libaTop = libaFrames[0].geometricBounds[0];
        var libaHeader = findPageItemByAltText(doc, "LIBA_HEADER", getItemPage(libaFrames[0]));
        if (!libaHeader) {
            libaHeader = findPageItemByName(doc, "LIBA_HEADER", getItemPage(libaFrames[0]));
        }
        if (libaHeader) {
            setItemTop(libaHeader, libaTop);
        }
    }

    if (zoharFrame) {
        fitFramesToContent([zoharFrame]);
        var zoharTop = positionFrameBottom(zoharFrame, 259);
        var zoharTitle = findPageItemByAltText(doc, "ZOHAR_TITLE", getItemPage(zoharFrame));
        if (zoharTitle) {
            setItemTop(zoharTitle, zoharTop);
        }
    }

    alert("Text import and cleanup complete.");
}

function runKatava() {
    var doc = app.activeDocument;

    var templateFrame = findTextFrameByNameOrAlt(doc, "KATAVA");
    if (!templateFrame) {
        alert("Missing text frame named or labeled KATAVA.");
        return;
    }

    var bodyStyle = getParagraphStyle(doc, "body");
    var b1Style = getCharacterStyle(doc, "B1");
    var objectStyleColon = getObjectStyle(doc, "NEKUDOTAIM");
    var objectStyleRegular = getObjectStyle(doc, "RAGIL");
    if (!bodyStyle || !b1Style || !objectStyleColon || !objectStyleRegular) {
        return;
    }

    var textFile = selectTextFile();
    if (!textFile) {
        return;
    }

    var tempFrame = createTempTextFrame(doc, templateFrame);
    tempFrame.contents = "";
    tempFrame.place(textFile);

    var story = tempFrame.parentStory;

    normalizeMainStory(story);
    applyCharacterStyleToFontStyles(story, b1Style, ["Bold", "Bold Italic"]);
    applyParagraphStyleToStory(story, bodyStyle, false);
    removeLeadingEmptyParagraphs(story);
    removeEmptyParagraphsGrep(story);
    removeHashMarkers(story);

    var positions = [
        { x: 407.453, y: 31.176 },
        { x: 289.44, y: 31.176 },
        { x: 407.447, y: 185 },
        { x: 114.463, y: 185 }
    ];

    var frames = [];
    var articleIndex = 0;
    while (true) {
        var range = extractNextArticleRange(story);
        if (!range) {
            break;
        }

        var pageIndex = Math.floor(articleIndex / positions.length);
        var slot = articleIndex % positions.length;
        var page = ensurePage(doc, pageIndex);
        var frame = getOrCreateFrame(templateFrame, page, articleIndex === 0);

        setFrameTopLeft(frame, page, positions[slot].x, positions[slot].y);
        frame.contents = "";
        range.duplicate(LocationOptions.AT_END, frame.insertionPoints[0]);
        range.remove();

        frames.push(frame);
        removeLeadingEmptyParagraphs(story);
        removeEmptyParagraphsGrep(story);
        removeLeadingSeparatorParagraphs(story);

        articleIndex += 1;
    }

    tempFrame.remove();
    applyObjectStylesByColon(frames, objectStyleColon, objectStyleRegular);

    alert("Articles placed successfully.");
}

function selectTextFile() {
    var textFile = File.openDialog("Select text file");
    if (!textFile) {
        return null;
    }
    if (!isSupportedTextFile(textFile)) {
        alert("Unsupported file type. Please select a .doc, .docx, .rtf, or .txt file.");
        return null;
    }
    return textFile;
}

function isSupportedTextFile(file) {
    if (!(file instanceof File)) {
        return false;
    }
    return /\.(docx?|rtf|txt)$/i.test(file.name);
}

function findTextFrameByNameOrAlt(doc, name) {
    var frames = doc.textFrames;
    var matches = [];
    for (var i = 0; i < frames.length; i++) {
        if (frames[i].name === name || getItemAltText(frames[i]) === name) {
            matches.push(frames[i]);
        }
    }
    if (matches.length > 1) {
        alert("Multiple text frames named/labeled " + name + ". Using the top-most frame.");
    }
    return matches.length > 0 ? selectTopLeftFrame(matches) : null;
}

function findTextFrameByAltText(doc, altText, page) {
    var frames = doc.textFrames;
    var matches = [];
    for (var i = 0; i < frames.length; i++) {
        if (getItemAltText(frames[i]) === altText && isItemOnPage(frames[i], page)) {
            matches.push(frames[i]);
        }
    }

    if (matches.length > 0) {
        if (matches.length > 1) {
            alert("Multiple text frames labeled " + altText + ". Using the top-most frame.");
        }
        return selectTopLeftFrame(matches);
    }

    var items = doc.allPageItems;
    var fallbackFrames = [];
    for (var j = 0; j < items.length; j++) {
        var item = items[j];
        if (getItemAltText(item) !== altText || !isItemOnPage(item, page)) {
            continue;
        }
        var frame = getSingleTextFrameFromItem(item);
        if (frame) {
            fallbackFrames.push(frame);
        }
    }

    if (fallbackFrames.length > 1) {
        alert("Multiple items labeled " + altText + " contain text frames. Using the top-most frame.");
    }

    if (fallbackFrames.length > 0) {
        return selectTopLeftFrame(fallbackFrames);
    }

    return null;
}

function getSingleTextFrameFromItem(item) {
    try {
        if (item instanceof TextFrame) {
            return item;
        }
    } catch (error) {
    }

    try {
        if (item.textFrames && item.textFrames.length === 1) {
            return item.textFrames[0];
        }
    } catch (error2) {
    }

    return null;
}

function getItemAltText(item) {
    var label = "";
    try {
        if (item.objectExportOptions) {
            label = item.objectExportOptions.customAltText || "";
        }
    } catch (error) {
        label = "";
    }
    return trimString(label);
}

function getItemPage(item) {
    try {
        if (item.parentPage) {
            return item.parentPage;
        }
    } catch (error) {
    }
    return null;
}

function isItemOnPage(item, page) {
    if (!page) {
        return true;
    }
    var itemPage = getItemPage(item);
    if (!itemPage) {
        return false;
    }
    if (itemPage === page) {
        return true;
    }
    try {
        if (page.appliedMaster && itemPage.parent === page.appliedMaster) {
            return true;
        }
    } catch (error) {
    }
    return false;
}

function selectTopLeftFrame(frames) {
    var best = frames[0];
    var bestBounds = best.geometricBounds;
    for (var i = 1; i < frames.length; i++) {
        var bounds = frames[i].geometricBounds;
        if (bounds[0] < bestBounds[0] || (bounds[0] === bestBounds[0] && bounds[1] < bestBounds[1])) {
            best = frames[i];
            bestBounds = bounds;
        }
    }
    return best;
}

function clearAltTextLabel(item) {
    try {
        if (item.objectExportOptions) {
            item.objectExportOptions.customAltText = "";
        }
    } catch (error) {
    }
    try {
        item.label = "";
    } catch (errorLabel) {
    }
}

function findPageItemByAltText(doc, altText, page) {
    var items = doc.allPageItems;
    var matches = [];
    for (var i = 0; i < items.length; i++) {
        if (getItemAltText(items[i]) === altText && isItemOnPage(items[i], page)) {
            matches.push(items[i]);
        }
    }
    if (matches.length > 1) {
        alert("Multiple items labeled " + altText + ". Using the top-most item.");
    }
    if (matches.length > 0) {
        return selectTopLeftFrame(matches);
    }
    return null;
}

function findPageItemByName(doc, name, page) {
    var items = doc.allPageItems;
    var matches = [];
    for (var i = 0; i < items.length; i++) {
        if (!isItemOnPage(items[i], page)) {
            continue;
        }
        try {
            if (items[i].name === name) {
                matches.push(items[i]);
            }
        } catch (error) {
        }
    }
    if (matches.length > 1) {
        alert("Multiple items named " + name + ". Using the top-most item.");
    }
    if (matches.length > 0) {
        return selectTopLeftFrame(matches);
    }
    return null;
}

function mmToPoints(valueMm) {
    return UnitValue(valueMm + "mm").as("pt");
}

function resolvePagePointToPasteboard(page, point) {
    if (!page) {
        return point;
    }
    try {
        var resolved = page.resolve(point, CoordinateSpaces.PAGE_COORDINATES, CoordinateSpaces.PASTEBOARD_COORDINATES);
        if (resolved instanceof Array && resolved.length > 0 && resolved[0] instanceof Array) {
            return resolved[0];
        }
        return resolved;
    } catch (error) {
        return point;
    }
}

function fitFramesToContent(frames) {
    for (var i = 0; i < frames.length; i++) {
        try {
            frames[i].fit(FitOptions.FRAME_TO_CONTENT);
        } catch (error) {
        }
    }
}

function setFrameBottom(frame, bottomPt) {
    var bounds = frame.geometricBounds;
    var height = bounds[2] - bounds[0];
    var newTop = bottomPt - height;
    frame.geometricBounds = [newTop, bounds[1], bottomPt, bounds[3]];
    return newTop;
}

function positionFrameBottom(frame, bottomMm) {
    var page = getItemPage(frame);
    var bottomPt = mmToPoints(bottomMm);
    if (page) {
        var resolved = resolvePagePointToPasteboard(page, [0, bottomPt]);
        bottomPt = resolved[1];
    }
    return setFrameBottom(frame, bottomPt);
}

function positionLibaFramesFromBottom(frames, bottomMm, gapMm) {
    if (!frames || frames.length === 0) {
        return;
    }
    var page = getItemPage(frames[frames.length - 1]);
    var bottomPt = mmToPoints(bottomMm);
    if (page) {
        var resolved = resolvePagePointToPasteboard(page, [0, bottomPt]);
        bottomPt = resolved[1];
    }
    var gapPt = mmToPoints(gapMm);
    var nextTop = setFrameBottom(frames[frames.length - 1], bottomPt);
    for (var i = frames.length - 2; i >= 0; i--) {
        var newBottom = nextTop - gapPt;
        nextTop = setFrameBottom(frames[i], newBottom);
    }
}

function setItemTop(item, topPt) {
    var bounds = item.geometricBounds;
    var height = bounds[2] - bounds[0];
    item.geometricBounds = [topPt, bounds[1], topPt + height, bounds[3]];
}

function applyTopInset(frame, topInsetMm) {
    if (topInsetMm === null || topInsetMm === undefined) {
        return;
    }
    try {
        var inset = frame.textFramePreferences.insetSpacing;
        if (inset && inset.length === 4) {
            frame.textFramePreferences.insetSpacing = [
                mmToPoints(topInsetMm),
                inset[1],
                inset[2],
                inset[3]
            ];
        }
    } catch (error) {
    }
}

function setFrameTopLeft(frame, page, xMm, yMm) {
    var xPt = mmToPoints(xMm);
    var yPt = mmToPoints(yMm);
    var resolved = resolvePagePointToPasteboard(page, [xPt, yPt]);
    var bounds = frame.geometricBounds;
    var width = bounds[3] - bounds[1];
    var height = bounds[2] - bounds[0];
    frame.geometricBounds = [resolved[1], resolved[0], resolved[1] + height, resolved[0] + width];
}

function ensurePage(doc, index) {
    while (doc.pages.length <= index) {
        doc.pages.add();
    }
    return doc.pages[index];
}

function getOrCreateFrame(templateFrame, page, useTemplate) {
    var frame = useTemplate ? templateFrame : templateFrame.duplicate();
    if (page && !isItemOnPage(frame, page)) {
        try {
            frame.move(page);
        } catch (error) {
        }
    }
    return frame;
}

function createTempTextFrame(doc, referenceFrame) {
    var page = referenceFrame.parentPage || doc.layoutWindows[0].activePage;
    var pageBounds = page.bounds;
    var width = 200;
    var height = 200;
    var y1 = pageBounds[0];
    var x1 = pageBounds[3] + 50;
    var y2 = y1 + height;
    var x2 = x1 + width;
    return page.textFrames.add({ geometricBounds: [y1, x1, y2, x2] });
}

function getParagraphStyle(doc, name) {
    var style = doc.paragraphStyles.itemByName(name);
    if (!style.isValid) {
        alert("Missing paragraph style: " + name);
        return null;
    }
    return style;
}

function getCharacterStyle(doc, name) {
    var style = doc.characterStyles.itemByName(name);
    if (!style.isValid) {
        alert("Missing character style: " + name);
        return null;
    }
    return style;
}

function getObjectStyle(doc, name) {
    var style = doc.objectStyles.itemByName(name);
    if (!style.isValid) {
        alert("Missing object style: " + name);
        return null;
    }
    return style;
}

function findParagraphStyle(doc, name) {
    var target = normalizeStyleName(name);
    var styles = doc.paragraphStyles;
    for (var i = 0; i < styles.length; i++) {
        if (normalizeStyleName(styles[i].name) === target) {
            return styles[i];
        }
    }
    return null;
}

function findCharacterStyle(doc, name) {
    var target = normalizeStyleName(name);
    var styles = doc.characterStyles;
    for (var i = 0; i < styles.length; i++) {
        if (normalizeStyleName(styles[i].name) === target) {
            return styles[i];
        }
    }
    return null;
}

function applyParagraphStyleToStory(story, style, clearAllOverrides) {
    if (!story || !story.texts.length) {
        return;
    }
    var text = story.texts[0];
    text.appliedParagraphStyle = style;
    if (clearAllOverrides) {
        text.clearOverrides(OverrideType.ALL);
    } else {
        text.clearOverrides(OverrideType.PARAGRAPH_ONLY);
    }
}

function applyParagraphStyleToParagraph(paragraph, style, clearAllOverrides) {
    if (!paragraph || !style) {
        return;
    }
    paragraph.appliedParagraphStyle = style;
    if (clearAllOverrides) {
        paragraph.clearOverrides(OverrideType.ALL);
    } else {
        paragraph.clearOverrides(OverrideType.PARAGRAPH_ONLY);
    }
}

function applyCharacterStyleToParagraph(paragraph, style, clearOverrides) {
    if (!paragraph || !style) {
        return;
    }
    var text = paragraph.texts[0];
    text.appliedCharacterStyle = style;
    if (clearOverrides) {
        text.clearOverrides(OverrideType.CHARACTER_ONLY);
    }
}

function normalizeMainStory(story) {
    changeGrep(story, " {2,}", " ");
    changeGrep(story, "\\r{2,}", "\r");
}

function applyCharacterStyleToFontStyles(story, charStyle, fontStyles) {
    for (var i = 0; i < fontStyles.length; i++) {
        changeTextByFontStyle(story, fontStyles[i], charStyle);
    }
}

function changeTextByFontStyle(story, fontStyle, charStyle) {
    app.findTextPreferences = NothingEnum.NOTHING;
    app.changeTextPreferences = NothingEnum.NOTHING;
    app.findTextPreferences.fontStyle = fontStyle;
    app.changeTextPreferences.appliedCharacterStyle = charStyle;
    story.changeText();
    app.findTextPreferences = NothingEnum.NOTHING;
    app.changeTextPreferences = NothingEnum.NOTHING;
}

function changeGrep(story, findWhat, changeTo) {
    app.findGrepPreferences = NothingEnum.NOTHING;
    app.changeGrepPreferences = NothingEnum.NOTHING;
    app.findGrepPreferences.findWhat = findWhat;
    app.changeGrepPreferences.changeTo = changeTo;
    story.changeGrep();
    app.findGrepPreferences = NothingEnum.NOTHING;
    app.changeGrepPreferences = NothingEnum.NOTHING;
}

function resetFindChangePreferences() {
    app.findTextPreferences = NothingEnum.NOTHING;
    app.changeTextPreferences = NothingEnum.NOTHING;
    app.findGrepPreferences = NothingEnum.NOTHING;
    app.changeGrepPreferences = NothingEnum.NOTHING;
}

function trimString(value) {
    return value.replace(/^\s+|\s+$/g, "");
}

function normalizeStyleName(value) {
    return trimString(value).toLowerCase();
}

function stripTrailingReturn(text) {
    return text.replace(/\r$/, "");
}

function removeLeadingEmptyParagraphs(story) {
    while (story.paragraphs.length > 0) {
        var paragraph = story.paragraphs[0];
        var text = stripTrailingReturn(paragraph.contents);
        if (trimString(text).length > 0) {
            break;
        }
        paragraph.remove();
    }
}

function removeEmptyParagraphsGrep(story) {
    changeGrep(story, "^\\r", "");
}

function removeHashMarkers(story) {
    changeGrep(story, "^#\\s*", "");
}

function applyMarkerParagraphStyle(story, marker, style) {
    var paragraphs = story.paragraphs;
    for (var i = 0; i < paragraphs.length; i++) {
        if (!paragraphStartsWith(paragraphs[i], marker)) {
            continue;
        }
        removeLeadingMarker(paragraphs[i], marker);
        applyParagraphStyleToParagraph(paragraphs[i], style, false);
    }
}

function removeParagraphsWithEquals(story) {
    changeGrep(story, "^.*==.*==.*==.*$", "");
}

function cleanAllTextFrames(doc) {
    var stories = [];
    var frames = doc.textFrames;
    for (var i = 0; i < frames.length; i++) {
        var story = frames[i].parentStory;
        if (!story) {
            continue;
        }
        var exists = false;
        for (var j = 0; j < stories.length; j++) {
            if (stories[j] === story) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            stories.push(story);
        }
    }

    for (var s = 0; s < stories.length; s++) {
        removeLeadingEmptyParagraphs(stories[s]);
        removeParagraphsWithEquals(stories[s]);
        removeEmptyParagraphsGrep(stories[s]);
    }
}

function escapeForRegExp(value) {
    return value.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function paragraphStartsWith(paragraph, marker) {
    var text = stripTrailingReturn(paragraph.contents);
    var re = new RegExp("^\\s*" + escapeForRegExp(marker));
    return re.test(text);
}

function removeLeadingMarker(paragraph, marker) {
    var contents = paragraph.contents;
    var hasReturn = contents.length > 0 && contents.charAt(contents.length - 1) === "\r";
    var text = stripTrailingReturn(contents);
    var re = new RegExp("^\\s*" + escapeForRegExp(marker) + "\\s*");
    text = text.replace(re, "");
    paragraph.contents = hasReturn ? (text + "\r") : text;
}

function findParagraphStartingWith(story, marker) {
    var escaped = marker.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    var re = new RegExp("^\\s*" + escaped);
    var paragraphs = story.paragraphs;
    for (var i = 0; i < paragraphs.length; i++) {
        if (re.test(paragraphs[i].contents)) {
            return paragraphs[i];
        }
    }
    return null;
}

function findParagraphIndexStartingWith(story, marker, startIndex) {
    var paragraphs = story.paragraphs;
    for (var i = startIndex; i < paragraphs.length; i++) {
        if (paragraphStartsWith(paragraphs[i], marker)) {
            return i;
        }
    }
    return -1;
}

function findParagraphIndexByMarkerAndContains(story, marker, containsText) {
    var paragraphs = story.paragraphs;
    for (var i = 0; i < paragraphs.length; i++) {
        var text = stripTrailingReturn(paragraphs[i].contents);
        if (paragraphStartsWith(paragraphs[i], marker) && text.indexOf(containsText) !== -1) {
            return i;
        }
    }
    return -1;
}

function findNextParagraphIndexStartingWith(story, marker, startIndex) {
    return findParagraphIndexStartingWith(story, marker, startIndex);
}

function extractBlockByMarkerAndContains(story, marker, containsText) {
    var startIdx = findParagraphIndexByMarkerAndContains(story, marker, containsText);
    if (startIdx < 0) {
        return null;
    }
    var nextIdx = findNextParagraphIndexStartingWith(story, marker, startIdx + 1);
    var endIdx = (nextIdx === -1) ? story.paragraphs.length - 1 : nextIdx - 1;
    var range = getTextRangeByParagraphIndices(story, startIdx, endIdx);
    if (!range) {
        return null;
    }
    var text = range.contents;
    range.remove();
    return text;
}

function extractTailAfterMarker(story, marker, containsText) {
    var headerIdx = findParagraphIndexByMarkerAndContains(story, marker, containsText);
    if (headerIdx < 0) {
        return null;
    }
    var startIdx = headerIdx + 1;
    var lastIdx = story.paragraphs.length - 1;
    var text = "";
    if (startIdx <= lastIdx) {
        var range = getTextRangeByParagraphIndices(story, startIdx, lastIdx);
        if (range) {
            text = range.contents;
            range.remove();
        }
    }
    if (headerIdx >= 0 && headerIdx < story.paragraphs.length) {
        story.paragraphs[headerIdx].remove();
    }
    return text;
}

function removeFirstParagraphIfStartsWith(story, marker) {
    if (story.paragraphs.length === 0) {
        return;
    }
    var firstParagraph = story.paragraphs[0];
    if (paragraphStartsWith(firstParagraph, marker)) {
        firstParagraph.remove();
    }
}

function extractBlocksByMarker(story, marker) {
    var blocks = [];
    while (true) {
        var startIdx = findParagraphIndexStartingWith(story, marker, 0);
        if (startIdx < 0) {
            break;
        }
        var nextIdx = findNextParagraphIndexStartingWith(story, marker, startIdx + 1);
        var endIdx = (nextIdx === -1) ? story.paragraphs.length - 1 : nextIdx - 1;
        var range = getTextRangeByParagraphIndices(story, startIdx, endIdx);
        if (!range) {
            break;
        }
        var text = range.contents;
        range.remove();
        blocks.push(text);
    }
    return blocks;
}

function getTextRangeByParagraphIndices(story, startIdx, endIdx) {
    if (startIdx < 0 || endIdx < 0 || endIdx < startIdx) {
        return null;
    }
    if (startIdx >= story.paragraphs.length || endIdx >= story.paragraphs.length) {
        return null;
    }
    var startParagraph = story.paragraphs[startIdx];
    var endParagraph = story.paragraphs[endIdx];
    var startChar = startParagraph.characters[0];
    var endChar = endParagraph.characters[-1];
    try {
        if (!startChar.isValid || !endChar.isValid) {
            return null;
        }
    } catch (error) {
        return null;
    }
    return story.texts.itemByRange(startChar, endChar);
}

function populateLibaFrames(baseFrame, blocks, libaStyle, bodyStyle) {
    var frames = [];
    var previousFrame = null;
    for (var i = 0; i < blocks.length; i++) {
        var frame = (i === 0) ? baseFrame : duplicateFrameBelow(previousFrame, 10, 4);
        frame.contents = "";
        frame.contents = blocks[i] ? String(blocks[i]) : "";

        var story = frame.parentStory;
        applyParagraphStyleToStory(story, bodyStyle, false);
        if (story.paragraphs.length > 0) {
            removeLeadingMarker(story.paragraphs[0], "$");
            applyParagraphStyleToParagraph(story.paragraphs[0], libaStyle, false);
        }

        frames.push(frame);
        previousFrame = frame;
    }
    return frames;
}

function duplicateFrameBelow(referenceFrame, gap, topInsetMm) {
    var duplicate = referenceFrame.duplicate();
    var bounds = referenceFrame.geometricBounds;
    var height = bounds[2] - bounds[0];
    clearAltTextLabel(duplicate);
    applyTopInset(duplicate, topInsetMm);
    duplicate.geometricBounds = [bounds[2] + gap, bounds[1], bounds[2] + gap + height, bounds[3]];
    return duplicate;
}

function applyPatitim1Styles(story, paragraphStyle, characterStyle) {
    var paragraphs = story.paragraphs;
    for (var i = 0; i < paragraphs.length; i++) {
        if (!paragraphStartsWith(paragraphs[i], "#")) {
            continue;
        }
        removeLeadingMarker(paragraphs[i], "#");
        if (paragraphStyle) {
            applyParagraphStyleToParagraph(paragraphs[i], paragraphStyle, false);
        } else if (characterStyle) {
            applyCharacterStyleToParagraph(paragraphs[i], characterStyle, true);
        }
    }
}

function applyPatitim2Pairs(story, paragraphStyle) {
    var i = 0;
    while (i < story.paragraphs.length) {
        var current = story.paragraphs[i];
        if (!paragraphStartsWith(current, "@")) {
            i += 1;
            continue;
        }
        var next = (i + 1 < story.paragraphs.length) ? story.paragraphs[i + 1] : null;
        if (next && paragraphStartsWith(next, "@")) {
            removeLeadingMarker(current, "@");
            removeLeadingMarker(next, "@");
            replaceParagraphBreakWithForcedLineBreak(current);
            applyParagraphStyleToParagraph(current, paragraphStyle, false);
        } else {
            removeLeadingMarker(current, "@");
            applyParagraphStyleToParagraph(current, paragraphStyle, false);
        }
        i += 1;
    }
}

function replaceParagraphBreakWithForcedLineBreak(paragraph) {
    try {
        var lastChar = paragraph.characters[-1];
        if (lastChar && lastChar.contents === "\r") {
            lastChar.contents = "\n";
            return;
        }
    } catch (error) {
    }
    paragraph.insertionPoints[-1].contents = "\n";
}

function isSeparatorParagraph(paragraph) {
    var text = trimString(stripTrailingReturn(paragraph.contents));
    return text.length >= 2 && /^=+$/.test(text);
}

function removeLeadingSeparatorParagraphs(story) {
    while (story.paragraphs.length > 0 && isSeparatorParagraph(story.paragraphs[0])) {
        story.paragraphs[0].remove();
    }
}

function findSeparatorIndex(story) {
    var paragraphs = story.paragraphs;
    for (var i = 0; i < paragraphs.length; i++) {
        if (isSeparatorParagraph(paragraphs[i])) {
            return i;
        }
    }
    return -1;
}

function extractNextArticleRange(story) {
    removeLeadingEmptyParagraphs(story);
    removeLeadingSeparatorParagraphs(story);
    if (story.paragraphs.length === 0) {
        return null;
    }

    var separatorIndex = findSeparatorIndex(story);
    var endIdx = (separatorIndex === -1) ? story.paragraphs.length - 1 : separatorIndex - 1;
    if (endIdx < 0) {
        story.paragraphs[0].remove();
        return extractNextArticleRange(story);
    }
    return getTextRangeByParagraphIndices(story, 0, endIdx);
}

function applyObjectStylesByColon(frames, colonStyle, regularStyle) {
    for (var i = 0; i < frames.length; i++) {
        var frame = frames[i];
        if (!frame.texts.length || !frame.texts[0].paragraphs.length) {
            continue;
        }
        var firstParagraph = frame.texts[0].paragraphs[0];
        var text = stripTrailingReturn(firstParagraph.contents);
        var style = (text.indexOf(":") !== -1) ? colonStyle : regularStyle;
        frame.appliedObjectStyle = style;
    }
}
