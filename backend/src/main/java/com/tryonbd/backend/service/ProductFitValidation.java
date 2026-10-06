package com.tryonbd.backend.service;

import java.util.*;

/** Optional product geometry; tracking and occlusion policy remain shared by each engine. */
public final class ProductFitValidation {
    private ProductFitValidation() {}
    public static void validate(String type, Map<String, Object> fit) {
        Set<String> allowed = switch(type) {
            case "EYEWEAR" -> Set.of("bridgePivot", "hinges", "widthMultiplier", "verticalOffset",
                "rotationOffset", "opacity", "templeDepth", "templeSplay", "cameraDistance", "templeCurve", "templeRootLength", "templeVerticalOffset", "frontalVisibleFraction", "earSeatOffset", "earSeatWeight", "templeSourceAnchors", "lensSurface");
            case "NECKLACE" -> Set.of("widthRatio", "dropRatio", "pendantDropRatio", "heightRatio");
            default -> Set.of("widthMultiplier", "heightMultiplier", "sourceLandmarks", "sourceRegions",
                "sourceCutouts", "sourceSleeveAlphaBounds");
        };
        for (var entry : fit.entrySet()) {
            String key = entry.getKey(); Object value = entry.getValue();
            if (!allowed.contains(key)) throw new IllegalArgumentException("Unsupported fitProfile field: " + key);
            switch(key) {
                case "bridgePivot" -> point(value);
                case "hinges" -> { Map<?, ?> m = object(value); exact(m, Set.of("left", "right")); point(m.get("left")); point(m.get("right"));
                    if (number(object(m.get("left")).get("x")) >= number(object(m.get("right")).get("x"))) fail(key); }
                case "lensSurface" -> {
                    Map<?, ?> lens = object(value);
                    if (!Set.of("width", "height", "opacity", "apertures", "hardware").containsAll(lens.keySet())) fail(key);
                    range(lens.get("width"),1,6000);range(lens.get("height"),1,6000);
                    double width=number(lens.get("width")),height=number(lens.get("height"));
                    if (width*height>24000000 || width%1!=0 || height%1!=0) fail(key);
                    if (lens.containsKey("opacity")) range(lens.get("opacity"),.1,1);
                    Object apertures=lens.get("apertures");
                    if (!(apertures instanceof List<?> list) || list.size()!=2) fail(key);
                    for (Object aperture : (List<?>)apertures) {
                        Map<?, ?> a=object(aperture);exact(a,Set.of("outline","samples"));
                        pixelPolygon(a.get("outline"),width,height,3,100);
                        pixelPolygon(a.get("samples"),width,height,1,20);
                    }
                    if (lens.containsKey("hardware")) {
                        if (!(lens.get("hardware") instanceof List<?> list) || list.size()>10) fail(key);
                        for (Object polygon : (List<?>)lens.get("hardware")) pixelPolygon(polygon,width,height,3,100);
                    }
                }
                case "templeSourceAnchors" -> {
                    Map<?, ?> sides = object(value); exact(sides, Set.of("left", "right"));
                    for (Object side : sides.values()) {
                        Map<?, ?> anchors = object(side);
                        if (!anchors.keySet().equals(Set.of("hinge","tip")) && !anchors.keySet().equals(Set.of("hinge","tip","shaft"))) fail(key);
                        if (anchors.containsKey("shaft")) point(anchors.get("shaft"));
                        point(anchors.get("hinge")); point(anchors.get("tip"));
                        Map<?, ?> h = object(anchors.get("hinge")), t = object(anchors.get("tip"));
                        if (Math.hypot(number(h.get("x"))-number(t.get("x")), number(h.get("y"))-number(t.get("y"))) < .01) fail(key);
                        if (anchors.containsKey("shaft")) {
                            var a=object(anchors.get("shaft"));
                            double dx=number(a.get("x"))-number(h.get("x")),dy=number(a.get("y"))-number(h.get("y"));
                            if (Math.hypot(dx,dy)<.01 || dx*(number(t.get("x"))-number(h.get("x")))+dy*(number(t.get("y"))-number(h.get("y")))<=0) fail(key);
                        }
                    }
                }
                case "sourceLandmarks" -> {
                    Map<?, ?> m = object(value);
                    if (!Set.of("leftShoulderSeam", "rightShoulderSeam", "collarLeft", "collarRight", "collarCenter", "collarCenterTop", "collarCenterBottom", "leftArmpit", "rightArmpit", "leftSleeveEnd", "rightSleeveEnd", "leftCuffOuter", "leftCuffInner", "rightCuffOuter", "rightCuffInner", "leftWaist", "rightWaist", "hemLeft", "hemRight", "leftShoulder", "rightShoulder", "leftCollar", "rightCollar", "bottomLeftHem", "bottomRightHem").containsAll(m.keySet())) fail(key);
                    m.values().forEach(ProductFitValidation::point);
                    ordered(m, "leftShoulder", "rightShoulder"); ordered(m, "bottomLeftHem", "bottomRightHem");
                }
                case "sourceRegions", "sourceCutouts" -> {
                    Map<?, ?> m = object(value);
                    if (!(key.equals("sourceRegions") ? Set.of("torso", "leftSleeve", "rightSleeve") : Set.of("collarOpening")).containsAll(m.keySet())) fail(key);
                    for (Object points : m.values()) {
                        if (!(points instanceof List<?> list) || list.size() < 3 || list.size() > 100) fail(key);
                        ((List<?>)points).forEach(ProductFitValidation::point);
                    }
                }
                case "sourceSleeveAlphaBounds" -> { Map<?, ?> m = object(value); exact(m, Set.of("left", "right"));
                    for (Object bounds : m.values()) { Map<?, ?> box = object(bounds); exact(box, Set.of("x", "y", "width", "height"));
                        range(box.get("x"), 0, 1); range(box.get("y"), 0, 1); range(box.get("width"), .001, 1); range(box.get("height"), .001, 1);
                        if (number(box.get("x")) + number(box.get("width")) > 1 || number(box.get("y")) + number(box.get("height")) > 1) fail(key);
                    }
                }
                case "widthMultiplier", "heightMultiplier" -> range(value, .5, 1.5);
                case "widthRatio" -> range(value, .3, 1.2);
                case "heightRatio" -> range(value, .1, 1.2);
                case "dropRatio", "verticalOffset" -> range(value, -.2, .4);
                case "pendantDropRatio" -> range(value, 0, .8);
                case "rotationOffset" -> range(value, -15, 15);
                case "opacity" -> range(value, 1, 100);
                case "templeDepth" -> range(value, .4, .85);
                case "templeSplay" -> range(value, .02, .08);
                case "templeCurve" -> range(value, .02, .12);
                case "templeRootLength" -> range(value, .08, .3);
                case "templeVerticalOffset" -> range(value, -.08, .08);
                case "frontalVisibleFraction" -> range(value, .02, .075);
                case "earSeatOffset" -> range(value, -.08, .08);
                case "earSeatWeight" -> range(value, 0, 1);
                case "cameraDistance" -> range(value, 4, 12);
                default -> fail(key);
            }
        }
    }
    private static void pixelPolygon(Object value, double width, double height, int min, int max) {
        if (!(value instanceof List<?> points) || points.size()<min || points.size()>max) fail("lens points");
        for (Object item : (List<?>)value) {
            if (!(item instanceof List<?> xy) || xy.size()!=2) fail("lens coordinate");
            var xy=(List<?>)item;range(xy.get(0),0,width);range(xy.get(1),0,height);
        }
    }
    private static void ordered(Map<?, ?> m, String a, String b) {
        if (m.containsKey(a) && m.containsKey(b) && number(object(m.get(a)).get("x")) >= number(object(m.get(b)).get("x"))) fail("crossed source landmarks");
    }
    private static void point(Object value) { Map<?, ?> p = object(value); exact(p, Set.of("x", "y")); range(p.get("x"), 0, 1); range(p.get("y"), 0, 1); }
    private static Map<?, ?> object(Object value) { if (!(value instanceof Map<?, ?>)) throw new IllegalArgumentException("Expected fitProfile object"); return (Map<?, ?>)value; }
    private static void exact(Map<?, ?> value, Set<String> keys) { if (!value.keySet().equals(keys)) fail("object keys"); }
    private static double number(Object value) { if (!(value instanceof Number n) || !Double.isFinite(n.doubleValue())) throw new IllegalArgumentException("Expected finite fitProfile number"); return ((Number)value).doubleValue(); }
    private static void range(Object value, double min, double max) { double n = number(value); if (n < min || n > max) fail("number out of range"); }
    private static void fail(String field) { throw new IllegalArgumentException("Invalid fitProfile: " + field); }
}
