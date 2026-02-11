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

        var textFile = File.openDialog("Select text file");
        if (!textFile) {
            return;
        }
        if (!isSupportedTextFile(textFile)) {
            alert("Unsupported file type. Please select a .doc, .docx, .rtf, or .txt file.");
            return;
        }

        var tempFrame = createTempTextFrame(doc, templateFrame);
        tempFrame.contents = "";
        tempFrame.place(textFile);

        var story = tempFrame.parentStory;

        normalizeStory(story);
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

function normalizeStory(story) {
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

function applyObjectStylesByColon(frames, colonStyle, regularStyle) {
    for (var i = 0; i < frames.length; i++) {
        var frame = frames[i];
        var firstParagraph = frame.texts[0].paragraphs[0];
        var text = stripTrailingReturn(firstParagraph.contents);
        var style = (text.indexOf(":") !== -1) ? colonStyle : regularStyle;
        frame.appliedObjectStyle = style;
    }
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

function setFrameTopLeft(frame, page, xMm, yMm) {
    var xPt = mmToPoints(xMm);
    var yPt = mmToPoints(yMm);
    var resolved = resolvePagePointToPasteboard(page, [xPt, yPt]);
    var bounds = frame.geometricBounds;
    var width = bounds[3] - bounds[1];
    var height = bounds[2] - bounds[0];
    frame.geometricBounds = [resolved[1], resolved[0], resolved[1] + height, resolved[0] + width];
}
