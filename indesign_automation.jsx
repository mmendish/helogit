#target "InDesign"

(function () {
    var previousUI = app.scriptPreferences.userInteractionLevel;
    app.scriptPreferences.userInteractionLevel = UserInteractionLevels.INTERACT_WITH_ALL;

    try {
        if (app.documents.length === 0) {
            alert("Open an InDesign document before running this script.");
            return;
        }

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

        var textFile = File.openDialog("Select text file");
        if (!textFile) {
            return;
        }
        if (!isSupportedTextFile(textFile)) {
            alert("Unsupported file type. Please select a .doc, .docx, .rtf, or .txt file.");
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
        var libaBlock = extractBlockByMarkerAndContains(mainStory, "#", "ליבא בעי");
        if (libaBlock) {
            tempFrame = createTempTextFrame(doc, mainFrame);
            tempFrame.contents = libaBlock ? String(libaBlock) : "";
            removeFirstParagraphIfStartsWith(tempFrame.parentStory, "#");

            var libaBlocks = extractBlocksByMarker(tempFrame.parentStory, "$");
            if (libaBlocks.length > 0) {
                populateLibaFrames(libaFrame, libaBlocks, libaStyle, bodyStyle);
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
        }

        applyPatitim1Styles(mainStory, patitim1ParagraphStyle, patitim1CharacterStyle);
        applyPatitim2Pairs(mainStory, patitim2Style);

        alert("Text import and cleanup complete.");
    } catch (error) {
        alert("Error: " + error.message);
    } finally {
        resetFindChangePreferences();
        app.scriptPreferences.userInteractionLevel = previousUI;
    }
})();

function isSupportedTextFile(file) {
    if (!(file instanceof File)) {
        return false;
    }
    return /\.(docx?|rtf|txt)$/i.test(file.name);
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

function trimString(value) {
    return value.replace(/^\s+|\s+$/g, "");
}

function normalizeStyleName(value) {
    return trimString(value).toLowerCase();
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

function populateLibaFrames(baseFrame, blocks, libaStyle, bodyStyle) {
    var previousFrame = null;
    for (var i = 0; i < blocks.length; i++) {
        var frame = (i === 0) ? baseFrame : duplicateFrameBelow(previousFrame, 10);
        frame.contents = "";
        frame.contents = blocks[i] ? String(blocks[i]) : "";

        var story = frame.parentStory;
        applyParagraphStyleToStory(story, bodyStyle, false);
        if (story.paragraphs.length > 0) {
            removeLeadingMarker(story.paragraphs[0], "$");
            applyParagraphStyleToParagraph(story.paragraphs[0], libaStyle, false);
        }

        previousFrame = frame;
    }
}

function duplicateFrameBelow(referenceFrame, gap) {
    var duplicate = referenceFrame.duplicate();
    var bounds = referenceFrame.geometricBounds;
    var height = bounds[2] - bounds[0];
    clearAltTextLabel(duplicate);
    duplicate.geometricBounds = [bounds[2] + gap, bounds[1], bounds[2] + gap + height, bounds[3]];
    return duplicate;
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

function getParagraphStyle(doc, name) {
    var style = findParagraphStyle(doc, name);
    if (!style) {
        alert("Missing paragraph style: " + name);
        return null;
    }
    return style;
}

function getCharacterStyle(doc, name) {
    var style = findCharacterStyle(doc, name);
    if (!style) {
        alert("Missing character style: " + name);
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
