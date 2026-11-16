// Dos engranajes involuta cautivos, tres cuerpos finales.
// OpenSCAD 2021.01 - unidades: mm.
$fn = 64;

modulo = 2;
angulo_presion = 20;
z1 = 12;
z2 = 24;
desplazamiento1 = 0.4;
desplazamiento2 = -0.4;
holgura = 0.4;
pared = 2.4;
diametro_eje = 6;
juego_tangencial_total = 1.2;
altura_rueda = 8;
chaflan = 0.4;
paso = PI * modulo;
distancia_centros = modulo * (z1 + z2) / 2;
x1 = -distancia_centros/2;
x2 = distancia_centros/2;
radio_eje = diametro_eje/2;
// Compensacion del poligono del agujero y margen de discretizacion.
radio_agujero = (radio_eje + holgura + 0.05)/cos(180/64);
radio_reten = radio_agujero + 1.6;
altura_marco = 4.4;
y_marco = 33;
z_coronacion = 36.2;

function rp(z) = modulo*z/2;
function rb(z) = rp(z)*cos(angulo_presion);
function ra(z,x) = rp(z)+modulo*(1+x);
function rf(z,x) = rp(z)-modulo*(1.25-x);
function involuta(a) = tan(a)*180/PI-a;
function semiespesor(z,x) = 90/z
    + (2*x*tan(angulo_presion)/z)*180/PI
    - (juego_tangencial_total/(4*rp(z)))*180/PI;
function angulo_flanco(r,z,x) = semiespesor(z,x)
    + involuta(angulo_presion)
    - involuta(acos(rb(z)/r));
function polar(r,a) = [r*cos(a),r*sin(a)];

module diente_2d(z,x) {
    b = rb(z);
    a = ra(z,x);
    f = rf(z,x);
    n = 18;
    t = angulo_flanco(b,z,x);
    // Prolongacion radial al pie: alivio conservador bajo el circulo base.
    polygon(concat(
        [polar(f-0.12,-t)],
        [for(i=[0:n]) let(r=b+(a-b)*i/n)
            polar(r,-angulo_flanco(r,z,x))],
        [for(i=[n:-1:0]) let(r=b+(a-b)*i/n)
            polar(r,angulo_flanco(r,z,x))],
        [polar(f-0.12,t)]
    ));
}

module perfil_rueda(z,x) {
    union() {
        circle(r=rf(z,x),$fn=128);
        for(k=[0:z-1])
            rotate(k*360/z) diente_2d(z,x);
    }
}

module envolvente_rueda(z,x) {
    // Chaflan axial de los bordes exteriores, sin cambiar el modulo.
    s = (ra(z,x)-0.3)/ra(z,x);
    union() {
        linear_extrude(height=chaflan,scale=1/s,convexity=12)
            scale([s,s]) perfil_rueda(z,x);
        translate([0,0,chaflan-0.01])
            linear_extrude(height=altura_rueda-2*chaflan+0.02,convexity=12)
                perfil_rueda(z,x);
        translate([0,0,altura_rueda-chaflan])
            linear_extrude(height=chaflan,scale=s,convexity=12)
                perfil_rueda(z,x);
    }
}

module rueda(z,x,fase=0) {
    difference() {
        rotate([0,0,fase]) envolvente_rueda(z,x);
        translate([0,0,-0.1])
            cylinder(h=altura_rueda+0.2,r=radio_agujero);
        translate([0,0,-0.01])
            cylinder(h=chaflan+0.01,
                r1=radio_agujero+chaflan+0.01,r2=radio_agujero);
        translate([0,0,altura_rueda-chaflan])
            cylinder(h=chaflan+0.01,
                r1=radio_agujero,r2=radio_agujero+chaflan+0.01);
    }
}

module contorno_marco_2d() {
    // Esquinas exteriores achaflanadas; abertura libre bajo las ruedas.
    difference() {
        polygon([[-39,-34.2],[49,-34.2],[51.2,-32],
                 [51.2,32],[49,34.2],[-39,34.2],
                 [-41.2,32],[-41.2,-32]]);
        translate([5,0]) square([87.6,63.6],center=true);
    }
}

module tirante(x,lado) {
    // Pendiente de 45 grados: crece desde el marco hacia el eje.
    hull() {
        translate([x,lado*y_marco,3.2])
            cube([pared,pared,pared],center=true);
        translate([x,0,z_coronacion])
            cube([pared,pared,pared],center=true);
    }
}

module eje_cautivo(x) {
    translate([x,0,0]) {
        // Alivio inferior contra pie de elefante.
        cylinder(h=chaflan,r1=radio_eje-chaflan,r2=radio_eje);
        translate([0,0,chaflan-0.01])
            cylinder(h=z_coronacion+pared/2-chaflan+0.01,r=radio_eje);
        // Reten integrado: expansion y cierre a 45 grados.
        translate([0,0,altura_rueda+holgura])
            cylinder(h=radio_reten-radio_eje,
                     r1=radio_eje,r2=radio_reten);
        translate([0,0,altura_rueda+holgura+radio_reten-radio_eje])
            cylinder(h=radio_reten-radio_eje,
                     r1=radio_reten,r2=radio_eje);
    }
}

module bastidor_fijo() {
    union() {
        linear_extrude(height=altura_marco) contorno_marco_2d();
        for(x=[x1,x2]) {
            eje_cautivo(x);
            tirante(x,-1);
            tirante(x,1);
        }
    }
}

// Tres componentes independientes: bastidor, pinon y rueda.
// Todos tienen apoyo propio en z=0; no hay plataforma bajo las ruedas.
union() {
    bastidor_fijo();
    translate([x1,0,0]) rueda(z1,desplazamiento1,0);
    translate([x2,0,0]) rueda(z2,desplazamiento2,180/z2);
}
