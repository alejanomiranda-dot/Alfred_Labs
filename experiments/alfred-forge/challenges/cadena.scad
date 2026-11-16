// Cadena cautiva de 5 cuerpos. OpenSCAD 2021.01, mm.
// Sin escalado. Pivotes neutros en X = 24, 48, 72 y 96.
$fn = 64;

cantidad = 5;
paso = 24;
holgura = 0.4;
pared = 2;
eje_d = 6;
alto = 8;
ancho_brazo = 4;
alto_brazo = 4.8;
chaflan = 0.3;

r_eje = eje_d/2;
r_cabeza = r_eje + 1.8;
juego_perfil = holgura*1.5;
r_cavidad = r_cabeza + juego_perfil;
// Compensa el apotema de las facetas para conservar pared radial de 2 mm.
r_exterior = (r_cavidad + pared)/cos(180/$fn);

angulo_giro = 20;
// La ranura incluye el ancho COMPLETO del brazo y su barrido,
// no solamente una cuña angular con vértice en el pivote.
margen_barrido = juego_perfil + 0.05;
radio_barrido = ancho_brazo/2 + margen_barrido;
largo_barrido = 2*r_exterior;
paso_angular = 1;

// Garganta lateral en la sección de diámetro máximo de la cabeza.
// Sus extremos interiores están más próximos que el diámetro
// de la cabeza: el ensanchamiento de giro no elimina la retención.
semigarganta = sqrt(r_cavidad*r_cavidad-radio_barrido*radio_barrido)
               * sin(angulo_giro)
               + radio_barrido*cos(angulo_giro);

assert(cantidad == 5);
assert(paso == 24);
assert(pared >= 2);
assert(juego_perfil*cos(180/$fn)/sqrt(2) > holgura);
assert(radio_barrido < r_cavidad);
assert(2*semigarganta < 2*r_cabeza);
assert(largo_barrido*cos(paso_angular/2) > r_exterior+radio_barrido);

module pivote() {
    rotate_extrude(convexity=6)
        polygon([
            [0,0],
            [r_eje-0.2,0],
            [r_eje,0.2],
            [r_eje,1.6],
            [r_cabeza,3.4],
            [r_cabeza,4.6],
            [r_eje,6.4],
            [r_eje,7.2],
            [0,7.2]
        ]);
}

// Envolvente conservadora del brazo girando entre -20 y +20 grados.
// Cada punto del brazo queda a <= ancho_brazo/2 del rayo central.
// El offset agrega ese semiancho MÁS una separación de 0.65 mm.
// El arco poligonal remoto queda completamente fuera del casquillo.
module abertura_barrida_2d() {
    offset(r=radio_barrido, $fn=64)
        polygon(concat(
            [[0,0]],
            [for (a=[-angulo_giro:paso_angular:angulo_giro])
                [largo_barrido*cos(a), largo_barrido*sin(a)]]
        ));
}

module casquillo() {
    difference() {
        rotate_extrude(convexity=8)
            polygon([
                [r_eje+juego_perfil+0.2,0],
                [r_exterior-0.4,0],
                [r_exterior,0.4],
                [r_exterior,alto-0.4],
                [r_exterior-0.4,alto],
                [r_eje+juego_perfil,alto],
                [r_eje+juego_perfil,6.4],
                [r_cavidad,4.6],
                [r_cavidad,3.4],
                [r_eje+juego_perfil,1.6],
                [r_eje+juego_perfil,0.2]
            ]);

        // Abertura pasante: libera también las esquinas inferiores
        // y superiores del brazo durante todo el movimiento.
        translate([0,0,-1])
            linear_extrude(height=alto+2, convexity=8)
                abertura_barrida_2d();
    }
}

module brazo(largo) {
    hull() {
        translate([0,-ancho_brazo/2+chaflan,0])
            cube([largo,ancho_brazo-2*chaflan,alto_brazo]);
        translate([0,-ancho_brazo/2,chaflan])
            cube([largo,ancho_brazo,alto_brazo-2*chaflan]);
    }
}

module extremo() {
    rotate_extrude(convexity=4)
        polygon([
            [0,0],[4.6,0],[5,0.4],
            [5,alto_brazo-0.4],[4.6,alto_brazo],
            [0,alto_brazo]
        ]);
}

// Un cuerpo por llamada; no hay base ni puentes entre cuerpos.
// El casquillo es del eslabón izquierdo y el pivote del derecho.
module eslabon(i) {
    translate([i*paso,0,0])
        union() {
            if (i == 0)
                extremo();
            else
                pivote();

            if (i < cantidad-1) {
                brazo(paso-r_cavidad-0.1);
                translate([paso,0,0]) casquillo();
            } else {
                brazo(paso);
                translate([paso,0,0]) extremo();
            }
        }
}

for (i=[0:cantidad-1])
    eslabon(i);
