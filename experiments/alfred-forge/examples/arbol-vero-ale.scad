// Alfred Forge: ejemplo procedural sin consumo de API.
// Dimensiones aproximadas: 78 x 78 x 140 mm. Monocolor.
$fn = 64;
module heart2d(s=1) {
    scale([s,s]) polygon(points=[
        [0,-5], [-7,1], [-7,5],[-4,7],[0,4],[4,7],[7,5],[7,1]
    ]);
}
module base() {
    difference() {
        cylinder(h=8, d=78);
        translate([-17,-22,7.1]) linear_extrude(height=1.5)
            text("VERO", size=5.5, font="Liberation Sans:style=Bold", halign="center", valign="center");
        translate([17,-22,7.1]) linear_extrude(height=1.5)
            text("ALE", size=5.5, font="Liberation Sans:style=Bold", halign="center", valign="center");
        translate([0,-22,7.1]) linear_extrude(height=1.5) heart2d(.55);
    }
}
module tree() {
    translate([0,0,8]) cylinder(h=17,d=15);
    translate([0,0,16]) cylinder(h=54,d1=67,d2=8);
    translate([0,0,46]) cylinder(h=48,d1=52,d2=6);
    translate([0,0,77]) cylinder(h=50,d1=36,d2=0);
    translate([0,0,126]) cylinder(h=14,d1=2,d2=0);
}
union() { base(); tree(); }
