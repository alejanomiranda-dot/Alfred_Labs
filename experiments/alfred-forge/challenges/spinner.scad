// Spinner cautivo de dos cuerpos. OpenSCAD 2021.01. Unidades: mm.
// Sin escalado global, soportes internos ni base compartida.
// El rotor conserva su concavidad en TODAS las secciones del bisel.
$fa = 4;
$fs = 0.3;
$fn = 90; // Multiplo de tres: conserva la simetria del mallado.

holgura = 0.4;
pared = 2;
eje_d = 8;
rotor_h = 10.6;
tapa_d = 22;
tapa_h = 3;
radio_lobulo = 10;
radio_orbita = 20;
radio_centro = 17;
chaflan = 0.6;
diametro_circunscrito = 2*(radio_orbita+radio_lobulo);

r_eje = eje_d/2;
r_tapa = tapa_d/2;
z_tapa_superior = rotor_h+holgura;
altura_total = z_tapa_superior+tapa_h;
z_inicio_cono = z_tapa_superior-(r_tapa-r_eje);

// Compensacion del poligono: la holgura no depende de alinear facetas.
// El hueco contiene la envolvente circular de la pieza central girada.
c_faceta = cos(180/$fn);
r_boca_inferior = (r_tapa+holgura)/c_faceta;
desfase_conico = (holgura*sqrt(2)+r_tapa*(1-c_faceta))/c_faceta;
intercepto_superior = r_eje-z_inicio_cono+desfase_conico;
z_inicio_cierre = tapa_h+holgura;
intercepto_inferior = r_boca_inferior+z_inicio_cierre;
z_cintura = (intercepto_inferior-intercepto_superior)/2;
r_cintura = intercepto_superior+z_cintura;
r_boca_superior = intercepto_superior+rotor_h;
alivio_inferior = 0.25;
r_hueco_max = max(r_boca_inferior+alivio_inferior,r_boca_superior);

// Solo cambia el borde exterior durante los 0.6 mm extremos.
// Nunca se calcula una envolvente convexa del rotor completo.
factor_borde = 1-chaflan/(diametro_circunscrito/2);

assert(holgura >= 0.4);
assert(pared >= 2);
assert(eje_d >= 2*pared);
assert(tapa_h-chaflan >= pared);
assert(rotor_h-2*chaflan >= pared);
assert(radio_centro*factor_borde*c_faceta-r_hueco_max >= pared);
assert(z_inicio_cono > tapa_h);
assert(z_cintura > z_inicio_cierre && z_cintura < rotor_h);
assert(r_cintura < r_tapa-pared);

module contorno_rotor() {
    union() {
        circle(r=radio_centro);
        for (a=[0,120,240])
            rotate(a)
                // Hull LOCAL de un brazo, no del contorno completo.
                hull() {
                    translate([11,0]) circle(r=8);
                    translate([radio_orbita,0]) circle(r=radio_lobulo);
                }
    }
}

module exterior_rotor() {
    union() {
        // Loft inferior homotetico: conserva los tres entrantes.
        linear_extrude(height=chaflan,scale=1/factor_borde,convexity=10)
            scale([factor_borde,factor_borde]) contorno_rotor();

        // Nucleo macizo de 9.4 mm, sin laminas entre brazos.
        translate([0,0,chaflan])
            linear_extrude(height=rotor_h-2*chaflan,convexity=10)
                contorno_rotor();

        // Loft superior, tambien concavo.
        translate([0,0,rotor_h-chaflan])
            linear_extrude(height=chaflan,scale=factor_borde,convexity=10)
                contorno_rotor();
    }
}

module alojamiento_cautivo() {
    // El techo inferior se cierra a 45 grados; el tramo superior abre.
    // No hay techos horizontales sobre cavidades ni soportes atrapados.
    rotate_extrude(convexity=10)
        polygon(points=[
            [0,-1],
            [r_boca_inferior+alivio_inferior,-1],
            [r_boca_inferior+alivio_inferior,0],
            [r_boca_inferior,alivio_inferior],
            [r_boca_inferior,z_inicio_cierre],
            [r_cintura,z_cintura],
            [r_boca_superior,rotor_h],
            [r_boca_superior,altura_total+1],
            [0,altura_total+1]
        ]);
}

module rotor() {
    difference() {
        exterior_rotor();
        alojamiento_cautivo();
    }
}

module eje_y_retenes() {
    // Un unico cuerpo fijo central: boton inferior, eje y boton superior.
    // La subida conica soporta el boton superior desde el propio eje.
    rotate_extrude(convexity=10)
        polygon(points=[
            [0,0],
            [r_tapa-chaflan,0],
            [r_tapa,chaflan],
            [r_tapa,tapa_h],
            [r_eje,tapa_h],
            [r_eje,z_inicio_cono],
            [r_tapa,z_tapa_superior],
            [r_tapa,altura_total-chaflan],
            [r_tapa-chaflan,altura_total],
            [0,altura_total]
        ]);
}

// EXACTAMENTE dos cuerpos independientes, ambos apoyados en z=0.
// El rotor queda retenido por los botones; no se une al eje.
rotor();
eje_y_retenes();
